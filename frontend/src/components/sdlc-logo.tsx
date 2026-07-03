import Image from "next/image";
import { cn } from "@/lib/utils";

export function SdlcLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="SDLC Conductor"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
