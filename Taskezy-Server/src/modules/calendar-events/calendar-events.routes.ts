import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query, withTransaction } from "../../db/pool";

export const calendarEventsRouter = Router();

calendarEventsRouter.use(requireAuth);

const SELECT = `
  SELECT ce.id, ce.system, ce.event_type, ce.title, ce.event_date, ce.event_time, ce.description,
         ce.lead_id, ce.created_by_id,
         cb.first_name || COALESCE(' ' || cb.last_name, '') AS created_by_name,
         ce.amount,
         COALESCE(
           (SELECT array_agg(au.first_name || COALESCE(' ' || au.last_name, ''))
            FROM calendar_event_attendees cea
            JOIN users au ON au.id = cea.user_id
            WHERE cea.event_id = ce.id),
           '{}'
         ) AS attendee_names
  FROM calendar_events ce
  LEFT JOIN users cb ON cb.id = ce.created_by_id
`;

calendarEventsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`${SELECT} ORDER BY ce.event_date`);
    sendOk(res, rows);
  })
);

const createEventSchema = z.object({
  system: z.enum(["CRM", "HRMS", "FINANCE", "ADMIN"]),
  eventType: z.enum(["SITE_VISIT", "FOLLOWUP", "BOOKING", "EOI", "HOLIDAY", "ABSENCE", "ADMIN_EVENT", "PAYMENT_REMINDER", "TASK"]),
  title: z.string().trim().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  leadId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  attendeeUserIds: z.array(z.string().uuid()).max(50).optional()
});

calendarEventsRouter.post(
  "/",
  validate({ body: createEventSchema }),
  asyncHandler(async (req, res) => {
    const { system, eventType, title, date, time, description, leadId, amount, attendeeUserIds } = req.body;

    // The event row and its attendee rows must live or die together — run
    // both inserts in one transaction so a bad attendeeUserId (FK violation)
    // rolls back the event too, instead of leaving an orphaned event behind
    // while the client sees a failure.
    let eventId: string;
    try {
      eventId = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO calendar_events (system, event_type, title, event_date, event_time, description, lead_id, created_by_id, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [system, eventType, title, date, time ?? null, description ?? null, leadId ?? null, req.user!.sub, amount ?? null]
        );
        const id = rows[0].id;

        if (attendeeUserIds?.length) {
          const values = attendeeUserIds.map((_: string, i: number) => `($1, $${i + 2})`).join(", ");
          await client.query(
            `INSERT INTO calendar_event_attendees (event_id, user_id) VALUES ${values}`,
            [id, ...attendeeUserIds]
          );
        }

        return id;
      });
    } catch (err) {
      // lead_id and attendeeUserIds both reference other tables — a
      // well-formed but nonexistent UUID passes Zod's uuid() check and only
      // fails at the DB as an FK violation.
      if (isForeignKeyViolation(err)) {
        throw ApiError.badRequest("Referenced lead or attendee not found.");
      }
      throw err;
    }

    const { rows: created } = await query(`${SELECT} WHERE ce.id = $1`, [eventId]);
    sendOk(res, created[0], 201);
  })
);

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}

const idParamSchema = z.object({ id: z.string().uuid() });

calendarEventsRouter.delete(
  "/:id",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM calendar_events WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw ApiError.notFound("Calendar event not found");
    sendOk(res, { deleted: true });
  })
);
