import { memo, type ReactNode } from "react";
import { VinylCover } from "./VinylCover";

/** Every music image shares the same proportional sleeve and disc, at every size. */
export const LibraryCover = memo(function LibraryCover({
  hash,
  seed,
  className,
  large = false,
  accent,
  inset,
  pulse = false,
}: {
  hash: string | null | undefined;
  seed: string;
  className?: string;
  large?: boolean;
  accent?: string | null;
  inset?: ReactNode;
  pulse?: boolean;
}) {
  return (
    <VinylCover
      hash={hash}
      seed={seed}
      accent={accent}
      pulse={pulse}
      fullBleed
      bare
      inset={inset}
      className={className}
      size={large ? "lg" : "sm"}
    />
  );
});
