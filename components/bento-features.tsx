"use client";

import { Infinity, Video, Users, Palette } from "lucide-react";

const features = [
  {
    icon: Infinity,
    title: "Unlimited AI Car Pics",
    description: "Transform any photo into viral edits — no limits, no credits. Upload once, create infinite variations with pro backgrounds and lighting.",
    gradient: "from-purple-500/10 to-pink-500/10",
    iconColor: "text-purple-500",
  },
  {
    icon: Video,
    title: "AI Video Generator",
    description: "Turn basic car clips into cinematic reels instantly. Your followers think you hired a whole production team. You just clicked a button.",
    gradient: "from-blue-500/10 to-cyan-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: Users,
    title: "Pro Showroom + Community",
    description: "Flex your builds, connect with 25,000 car creators, climb leaderboards. Get featured, get followers, get noticed.",
    gradient: "from-orange-500/10 to-red-500/10",
    iconColor: "text-orange-500",
  },
  {
    icon: Palette,
    title: "Designer Mode + Feature Requests",
    description: "Pro members get daily requests + exclusive templates. Access features weeks before everyone else. Your ideas shape the product.",
    gradient: "from-green-500/10 to-emerald-500/10",
    iconColor: "text-green-500",
  },
];

export default function BentoFeatures() {
  return (
    <section className="w-full py-[3rem] md:py-[4rem] px-[1rem] sm:px-[1.75rem] relative">
      {/* Background gradient */}
      <div 
        aria-hidden 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)"
        }}
      />

      <div className="max-w-7xl mx-auto relative z-[1]">
        {/* Bento grid - 2x2 on desktop, stacks on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[1rem] md:gap-[1.25rem] lg:gap-[1.5rem]">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={index}
                className={`
                  group relative overflow-hidden rounded-2xl border border-[color:var(--border)] 
                  bg-gradient-to-br ${feature.gradient}
                  p-[1.5rem] md:p-[2rem] 
                  transition-all duration-300 
                  hover:shadow-lg hover:shadow-primary/5
                  hover:border-primary/30
                  flex flex-col
                  min-h-[16rem] md:min-h-[18rem]
                `}
              >
                {/* Background pattern overlay */}
                <div 
                  aria-hidden
                  className="absolute inset-0 opacity-[0.03] pointer-events-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                  }}
                />

                {/* Icon */}
                <div className={`
                  w-[3rem] h-[3rem] md:w-[3.5rem] md:h-[3.5rem] 
                  rounded-xl 
                  bg-background/80 backdrop-blur-sm
                  border border-[color:var(--border)]
                  flex items-center justify-center 
                  mb-[1.25rem] md:mb-[1.5rem]
                  group-hover:scale-110 transition-transform duration-300
                  relative z-[1]
                `}>
                  <Icon className={`w-[1.5rem] h-[1.5rem] md:w-[1.75rem] md:h-[1.75rem] ${feature.iconColor}`} />
                </div>

                {/* Content */}
                <div className="relative z-[1] flex-1 flex flex-col">
                  <h3 className="text-lg md:text-xl font-semibold mb-[0.75rem] text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                {/* Image placeholder - for future images */}
                <div 
                  aria-hidden
                  className="absolute bottom-0 right-0 w-[8rem] h-[8rem] opacity-0 pointer-events-none group-hover:opacity-5 transition-opacity duration-500"
                  style={{
                    background: `radial-gradient(circle at center, ${feature.iconColor.replace('text-', 'var(--')}, transparent 70%)`
                  }}
                />
              </article>
            );
          })}
        </div>

        {/* Bottom CTA text */}
        <div className="text-center mt-[2rem] md:mt-[2.5rem]">
          <p className="text-xs md:text-sm text-muted-foreground">
            Join thousands of car enthusiasts creating content that gets noticed
          </p>
        </div>
      </div>
    </section>
  );
}

