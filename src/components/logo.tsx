export default function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-sme.png"
      alt="SabeTudo"
      className={className ?? "h-14 w-auto"}
      style={{ 
        objectFit: "contain",
        filter: "brightness(1.15) contrast(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
      }}
    />
  );
}