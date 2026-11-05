export function ComingSoon({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white p-8 text-center">
      <span aria-hidden className="text-5xl">
        {icon}
      </span>
      <p className="mt-3 text-muted">{text}</p>
    </div>
  );
}
