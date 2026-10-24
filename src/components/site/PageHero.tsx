import Image from "next/image";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/utils";

type Props = { eyebrow?: string | null; title: string; body?: string | null; image?: string | null; crumbs: Crumb[]; children?: React.ReactNode; dark?: boolean };

export function PageHero({ eyebrow, title, body, image, crumbs, children, dark }: Props) {
  return (
    <section className={cn("relative pt-32 pb-16 lg:pt-40 lg:pb-20", dark && "bg-space text-white")}>
      {image && (
        <div className="absolute inset-0">
          <Image src={image} alt="" fill priority className="object-cover" sizes="100vw" />
          <div className={cn("absolute inset-0", dark ? "bg-[linear-gradient(180deg,rgba(5,8,12,0.55),rgba(5,8,12,0.92))]" : "bg-[linear-gradient(180deg,rgba(246,245,240,0.85),rgba(246,245,240,0.97))]")} />
        </div>
      )}
      {/* z-40 keeps absolutely-positioned dropdown panels (filter row) above the
          transformed (framer-motion) listing cards and the WhatsApp bubble that
          follow in the DOM. Stays below the header (z-50). */}
      <div className="relative z-40 mx-auto max-w-[1400px] px-4 sm:px-6">
        <Breadcrumbs items={crumbs} dark={dark} />
        <Reveal className="mt-8 max-w-3xl">
          {eyebrow && <p className={cn("eyebrow", dark && "!text-brand-bright")}>{eyebrow}</p>}
          <h1 className="display mt-4 text-[clamp(2.4rem,5.5vw,4.4rem)]">{title}</h1>
          {body && <p className={cn("mt-5 max-w-2xl text-[16px] leading-relaxed", dark ? "text-white/70" : "text-charcoal/80")}>{body}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}
