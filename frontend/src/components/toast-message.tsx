"use client";

type ToastMessageProps = {
  message: string;
  type?: "success" | "error";
};

export function ToastMessage({ message, type = "success" }: ToastMessageProps) {
  const colorClass =
    type === "success"
      ? "bg-jade/15 text-jade border border-jade/40"
      : "bg-carimbo/10 text-carimbo-bright border border-carimbo/40";

  return (
    <div className="fixed top-4 right-4 z-[100] pointer-events-none">
      <div
        className={`rounded-sm px-4 py-2 text-sm font-medium ${colorClass}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </div>
  );
}
