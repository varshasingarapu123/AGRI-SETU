import React, { useState } from 'react';
import { Sprout } from 'lucide-react';
import cropPaddyImg from '../assets/images/crop_paddy_harvest_1793499391606.jpg';
import cropTurmericBananaImg from '../assets/images/crop_turmeric_banana_1793499392193.jpg';
import cropChilliPulsesImg from '../assets/images/crop_chilli_pulses_1793499394077.jpg';
import supplyDripImg from '../assets/images/supply_drip_irrigation_1793499393253.jpg';
import supplySeedsImg from '../assets/images/supply_seeds_fertilizer_1793499394970.jpg';

const ASSET_MAP: Record<string, string> = {
  crop_paddy_harvest: cropPaddyImg,
  crop_turmeric_banana: cropTurmericBananaImg,
  crop_chilli_pulses: cropChilliPulsesImg,
  supply_drip_irrigation: supplyDripImg,
  supply_seeds_fertilizer: supplySeedsImg,
};

export function resolveImageKey(key?: string | null): string {
  if (!key) return cropPaddyImg;
  return ASSET_MAP[key] || cropPaddyImg;
}

interface ResilientImageProps {
  imageKey?: string | null;
  alt: string;
  className?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  imageKey,
  alt,
  className = 'w-full h-44 object-cover',
}) => {
  const [failed, setFailed] = useState(false);
  const src = resolveImageKey(imageKey);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#EEF3ED] text-[#2D6A4F] px-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Sprout className="w-7 h-7 mb-1.5 opacity-80" />
        <span className="text-xs font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
