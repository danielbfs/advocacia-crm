"use client";

type ToastMessageProps = {
  message: string;
  type?: "success" | "error";
};

export function ToastMessage({ message, type = "success" }: ToastMessageProps) {
  const colorClass =
    type === "success"
      ? "bg-green-600 text-white"
      : "bg-red-600 text-white";

  return (
    <div className="fixed top-4 right-4 z-[100] pointer-events-none">
      <div
        className={`rounded-lg shadow-lg px-4 py-2 text-sm font-medium ${colorClass}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </div>
  );
}
