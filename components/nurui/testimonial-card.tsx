import { FaQuoteLeft } from "react-icons/fa6";
import Image from "next/image";
import RatingStars from "@/components/nurui/rating-star";

interface IProps {
  position: string;
  name: string;
  review: string;
  marginTop?: string;
  src: string;
}

export default function TestimonialCard({
  position,
  name,
  review,
  marginTop,
  src,
}: IProps) {
  return (
    <div
      className={`cursor-pointer min-w-[18rem] max-w-[22rem] h-[16rem] p-4 shadow-2xl rounded-lg bg-card border border-border relative flex flex-col ${marginTop || ''}`}
    >
      <FaQuoteLeft className="absolute -top-2 left-[5%] text-[1.3rem] text-muted-foreground/50" />
      <p className="text-card-foreground text-[0.9rem] text-center lg:text-left leading-relaxed flex-1">
        {review}
      </p>

      <div className="flex flex-col lg:flex-row items-center lg:items-start mt-auto pt-4 justify-between gap-3 lg:gap-0">
        <div className="flex flex-col lg:flex-row items-center gap-2.5">
          <Image
            src={src}
            alt={name}
            className="size-8 rounded-full object-cover"
            height={32}
            width={32}
            unoptimized
          />
          <div className="text-center lg:text-start">
            <h2 className="text-foreground font-semibold whitespace-nowrap">{name}</h2>
            <p className="text-sm text-muted-foreground whitespace-nowrap">{position}</p>
          </div>
        </div>

        <RatingStars size="size-3" />
      </div>
      <FaQuoteLeft className="absolute -bottom-2 right-[5%] rotate-[180deg] text-[1.3rem] text-muted-foreground/50" />
    </div>
  );
}
