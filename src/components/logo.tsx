export default function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-sme.png"
      alt="SabeTudo"
      className={className ?? "h-14 w-auto"}
      style={{ objectFit: "contain" }}
    />
  );
}