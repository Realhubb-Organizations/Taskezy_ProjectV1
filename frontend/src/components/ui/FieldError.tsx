import React from "react";

/** Red helper line under a form field; renders nothing when there's no error. */
export default function FieldError({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[11px] font-semibold text-red-600">
      {message}
    </p>
  );
}

/** Border classes for an input that has an error. */
export const fieldErrorClass = (hasError: boolean) => (hasError ? "!border-red-400 focus:!border-red-500" : "");
