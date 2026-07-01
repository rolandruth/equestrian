import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
  totalReviews?: number;
}

export function StarRating({ rating, max = 5, size = "md", showNumber = false, totalReviews }: StarRatingProps) {
  const sizeClass = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, rating - i));
        return (
          <div key={i} className="relative" style={{ width: size === "sm" ? 12 : size === "lg" ? 24 : 16 }}>
            <Star className={`${sizeClass} text-gray-200 dark:text-gray-700`} fill="currentColor" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${sizeClass} text-amber-400`} fill="currentColor" />
            </div>
          </div>
        );
      })}
      {showNumber && (
        <span className={`font-medium ${size === "sm" ? "text-xs" : "text-sm"} text-gray-700 dark:text-gray-300 ml-1`}>
          {rating.toFixed(1)}
        </span>
      )}
      {totalReviews !== undefined && (
        <span className={`text-muted-foreground ${size === "sm" ? "text-xs" : "text-sm"}`}>
          ({totalReviews} {totalReviews === 1 ? "review" : "reviews"})
        </span>
      )}
    </div>
  );
}

interface StarPickerProps {
  value: number;
  onChange: (rating: number) => void;
  size?: "sm" | "md" | "lg";
}

export function StarPicker({ value, onChange, size = "lg" }: StarPickerProps) {
  const sizeClass = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110 focus:outline-none"
        >
          <Star
            className={`${sizeClass} transition-colors ${
              star <= value ? "text-amber-400" : "text-gray-300 dark:text-gray-600"
            }`}
            fill="currentColor"
          />
        </button>
      ))}
    </div>
  );
}
