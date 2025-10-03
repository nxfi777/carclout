import Image from "next/image";

export default function FoundersGuarantee() {
  return (
    <section className="w-full py-[3rem] md:py-[4rem] px-[1rem]">
      <div className="max-w-[50rem] mx-auto">
        <div className="relative rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent)]/50 p-[1.5rem] md:p-[2.5rem] border border-[color:var(--border)]">
          <div className="flex flex-col md:flex-row items-center gap-[2rem] md:gap-[3rem]">
            {/* Image */}
            <div className="flex-shrink-0">
              <div className="relative w-[8rem] h-[8rem] md:w-[10rem] md:h-[10rem] rounded-full overflow-hidden border-4 border-[color:var(--primary)]/30 shadow-lg">
                <Image
                  src="/kasra.webp"
                  alt="Kasra, Founder of CarClout & Nytforge"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 8rem, 10rem"
                />
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 text-center md:text-left space-y-[1rem]">
              <h3 className="text-[1.5rem] md:text-[1.75rem] font-bold leading-tight">
                Founder&apos;s Guarantee
              </h3>
              <p className="text-[1.05rem] md:text-[1.15rem] leading-relaxed text-[color:var(--foreground)]/90">
                If your first CarClout edit doesn&apos;t get more likes than your last post, 
                cancel in one click and keep the edit anyway.
              </p>
              <p className="text-[0.95rem] md:text-[1.05rem] font-medium leading-relaxed text-[color:var(--foreground)]/80">
                No Tricks. No Hoops. No Hard Feelings.
              </p>
              <p className="text-[0.95rem] md:text-[1rem] italic text-[color:var(--foreground)]/70 pt-[0.5rem]">
                ~ Kasra, Founder of CarClout
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

