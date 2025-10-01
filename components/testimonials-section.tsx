"use client";

import { Marquee } from "@/components/nurui/marquee";
import TestimonialCard from "@/components/nurui/testimonial-card";

const testimonials = [
  {
    id: 1,
    name: "Marcus Chen",
    position: "BMW M4 G82 Owner",
    review: "Finally found a tool that makes my M4 look as good in photos as it does in person. The backgrounds are insane and it takes literally 2 minutes. My Instagram engagement doubled overnight.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus",
  },
  {
    id: 2,
    name: "Sarah Johnson",
    position: "Porsche 911 GT3 Owner",
    review: "As someone who's spent thousands on professional photoshoots, this is a game-changer. The quality is incredible and I can do it from my garage. The Pro plan pays for itself instantly.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
  },
  {
    id: 3,
    name: "Alex Rodriguez",
    position: "Tesla Model S Plaid Owner",
    review: "I was skeptical about AI edits but this blew my mind. My Tesla looks like it's in a magazine spread every time. The templates make it so easy even my dad could use it.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
  },
  {
    id: 4,
    name: "Tyler Jackson",
    position: "Audi RS6 Avant Owner",
    review: "I run a car page with 50K followers and this saves me hours every week. The backgrounds look professional and the lighting effects are chef's kiss. Worth every penny.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Tyler",
  },
  {
    id: 5,
    name: "David Martinez",
    position: "Mercedes-AMG GT Owner",
    review: "Best $1 I ever spent trying this out. Upgraded to Pro immediately. My AMG has never looked better and I'm getting DMs asking who my photographer is. It's literally just my phone and this app.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=David",
  },
  {
    id: 6,
    name: "Chris Anderson",
    position: "Lamborghini Huracán Owner",
    review: "The video generation feature is absolutely nuts. I can create cinematic rolls of my Huracán that look like professional commercials. My followers think I hired a whole production team.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Chris",
  },
  {
    id: 7,
    name: "Ryan Cooper",
    position: "Ford Mustang GT Owner",
    review: "Honestly didn't think my Mustang could look this good. The glow effects and dramatic backgrounds make every shot look like it belongs on a billboard. 10/10 recommend.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ryan",
  },
  {
    id: 8,
    name: "Jessica Lee",
    position: "Range Rover Sport Owner",
    review: "Perfect for when I want to post but the weather isn't cooperating. The AI backgrounds are so realistic no one can tell it's edited. Saves me so much time waiting for perfect lighting.",
    src: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jessica",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="w-full py-[3rem] overflow-hidden">
      <div className="max-w-7xl mx-auto px-[1rem] mb-[2rem]">
        <h2 className="text-2xl md:text-3xl font-semibold text-center mb-[0.75rem]">
          Loved by creators worldwide
        </h2>
        <p className="text-sm md:text-base text-center text-muted-foreground">
          Join thousands of satisfied users who are creating amazing content
        </p>
      </div>
      
      <Marquee pauseOnHover className="[--duration:50s]">
        {testimonials.map((testimonial) => (
          <TestimonialCard
            key={testimonial.id}
            name={testimonial.name}
            position={testimonial.position}
            review={testimonial.review}
            src={testimonial.src}
          />
        ))}
      </Marquee>
    </section>
  );
}

