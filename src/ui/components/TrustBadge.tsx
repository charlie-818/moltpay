import React from 'react';
import { cn } from '../lib/utils';
import { TrustLevel } from '../../skills/types';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Award,
} from 'lucide-react';

export interface TrustBadgeProps {
  trustLevel: TrustLevel;
  certifications?: string[];
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const trustConfig: Record<TrustLevel, {
  label: string;
  color: string;
  bgColor: string;
  Icon: typeof Shield;
}> = {
  system: {
    label: 'System',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    Icon: Shield,
  },
  verified: {
    label: 'Verified',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    Icon: ShieldCheck,
  },
  community: {
    label: 'Community',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    Icon: ShieldQuestion,
  },
  untrusted: {
    label: 'Untrusted',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    Icon: ShieldAlert,
  },
};

const sizeConfig = {
  sm: { icon: 14, text: 'text-xs', padding: 'px-1.5 py-0.5' },
  md: { icon: 16, text: 'text-sm', padding: 'px-2 py-1' },
  lg: { icon: 20, text: 'text-base', padding: 'px-3 py-1.5' },
};

export function TrustBadge({
  trustLevel,
  certifications,
  showLabel = true,
  size = 'md',
  className,
}: TrustBadgeProps) {
  const config = trustConfig[trustLevel];
  const sizeConf = sizeConfig[size];
  const Icon = config.Icon;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium',
          config.color,
          config.bgColor,
          sizeConf.padding,
          sizeConf.text
        )}
      >
        <Icon size={sizeConf.icon} />
        {showLabel && <span>{config.label}</span>}
      </span>

      {certifications && certifications.length > 0 && (
        <div className="flex items-center gap-0.5">
          {certifications.map((cert) => (
            <CertificationBadge key={cert} certification={cert} size={size} />
          ))}
        </div>
      )}
    </div>
  );
}

interface CertificationBadgeProps {
  certification: string;
  size?: 'sm' | 'md' | 'lg';
}

function CertificationBadge({ certification, size = 'md' }: CertificationBadgeProps) {
  const sizeConf = sizeConfig[size];

  const certConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    'AIUC-1': {
      label: 'AIUC-1',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-100',
    },
    Audited: {
      label: 'Audited',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-100',
    },
  };

  const config = certConfig[certification] || {
    label: certification,
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-medium',
        config.color,
        config.bgColor,
        sizeConf.padding,
        sizeConf.text
      )}
      title={certification}
    >
      <Award size={sizeConf.icon - 2} />
      <span>{config.label}</span>
    </span>
  );
}

export interface PublisherBadgeProps {
  publisherName: string;
  isPartner?: boolean;
  className?: string;
}

export function PublisherBadge({ publisherName, isPartner, className }: PublisherBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm text-gray-600',
        className
      )}
    >
      <span>by</span>
      <span className="font-medium text-gray-900">{publisherName}</span>
      {isPartner && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <ShieldCheck size={12} />
          Partner
        </span>
      )}
    </span>
  );
}
