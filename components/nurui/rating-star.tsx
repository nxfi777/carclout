import RatingIcon from "@/components/nurui/rating-icon";

const RatingStars = ({
  count = 5,
  size,
}: {
  size?: string;
  count?: number;
}) => (
  <div className="flex items-center">
    {Array.from({ length: count }).map((_, i) => (
      <RatingIcon key={i} rate={true} size={size} />
    ))}
  </div>
);

export default RatingStars;
