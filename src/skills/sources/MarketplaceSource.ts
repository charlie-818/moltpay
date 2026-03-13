import {
  MarketplaceSkill,
  MarketplaceSearchParams,
  MarketplaceSearchResult,
  SkillMetadata,
  TrustLevel,
  SkillError,
} from '../types';

export interface MarketplaceConfig {
  apiUrl: string;
  apiKey?: string;
  cacheTimeout?: number;  // Cache duration in ms
}

export interface MarketplaceApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class MarketplaceSource {
  private config: MarketplaceConfig;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  constructor(config: MarketplaceConfig) {
    this.config = {
      cacheTimeout: 60000, // 1 minute default cache
      ...config,
    };
  }

  /**
   * Search for skills in the marketplace
   */
  async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
    const cacheKey = `search:${JSON.stringify(params)}`;
    const cached = this.getFromCache<MarketplaceSearchResult>(cacheKey);
    if (cached) return cached;

    const queryParams = new URLSearchParams();
    if (params.query) queryParams.set('q', params.query);
    if (params.tags) queryParams.set('tags', params.tags.join(','));
    if (params.trustLevel) queryParams.set('trust', params.trustLevel.join(','));
    if (params.pricingModel) queryParams.set('pricing', params.pricingModel.join(','));
    if (params.sortBy) queryParams.set('sort', params.sortBy);
    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.offset) queryParams.set('offset', params.offset.toString());

    const response = await this.fetch<MarketplaceSearchResult>(
      `/skills/search?${queryParams.toString()}`
    );

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Get a specific skill by ID
   */
  async getSkill(skillId: string): Promise<MarketplaceSkill | null> {
    const cacheKey = `skill:${skillId}`;
    const cached = this.getFromCache<MarketplaceSkill>(cacheKey);
    if (cached) return cached;

    try {
      const skill = await this.fetch<MarketplaceSkill>(`/skills/${skillId}`);
      this.setCache(cacheKey, skill);
      return skill;
    } catch (error) {
      if ((error as SkillError).code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Download skill content (SKILL.md)
   */
  async downloadSkillContent(skillId: string): Promise<string> {
    const response = await fetch(`${this.config.apiUrl}/skills/${skillId}/content`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new SkillError(
        `Failed to download skill: ${response.statusText}`,
        'DOWNLOAD_ERROR',
        { skillId, status: response.status }
      );
    }

    return response.text();
  }

  /**
   * Get featured/recommended skills
   */
  async getFeatured(): Promise<MarketplaceSkill[]> {
    const cacheKey = 'featured';
    const cached = this.getFromCache<MarketplaceSkill[]>(cacheKey);
    if (cached) return cached;

    const skills = await this.fetch<MarketplaceSkill[]>('/skills/featured');
    this.setCache(cacheKey, skills);
    return skills;
  }

  /**
   * Get trending skills
   */
  async getTrending(limit: number = 10): Promise<MarketplaceSkill[]> {
    const result = await this.search({
      sortBy: 'popularity',
      limit,
    });
    return result.skills;
  }

  /**
   * Get top-rated skills
   */
  async getTopRated(limit: number = 10): Promise<MarketplaceSkill[]> {
    const result = await this.search({
      sortBy: 'rating',
      limit,
    });
    return result.skills;
  }

  /**
   * Get recently added skills
   */
  async getRecent(limit: number = 10): Promise<MarketplaceSkill[]> {
    const result = await this.search({
      sortBy: 'recent',
      limit,
    });
    return result.skills;
  }

  /**
   * Get skills by a specific publisher
   */
  async getByPublisher(publisherId: string): Promise<MarketplaceSkill[]> {
    const cacheKey = `publisher:${publisherId}`;
    const cached = this.getFromCache<MarketplaceSkill[]>(cacheKey);
    if (cached) return cached;

    const skills = await this.fetch<MarketplaceSkill[]>(`/publishers/${publisherId}/skills`);
    this.setCache(cacheKey, skills);
    return skills;
  }

  /**
   * Submit a rating/review for a skill
   */
  async submitRating(
    skillId: string,
    rating: number,
    review?: string,
    userWallet?: string
  ): Promise<void> {
    await this.fetch(`/skills/${skillId}/ratings`, {
      method: 'POST',
      body: JSON.stringify({
        rating,
        review,
        wallet: userWallet,
      }),
    });

    // Invalidate cache
    this.cache.delete(`skill:${skillId}`);
  }

  /**
   * Get ratings for a skill
   */
  async getRatings(skillId: string, limit: number = 20): Promise<Rating[]> {
    return this.fetch<Rating[]>(`/skills/${skillId}/ratings?limit=${limit}`);
  }

  /**
   * Report a skill for policy violation
   */
  async reportSkill(
    skillId: string,
    reason: string,
    details?: string
  ): Promise<void> {
    await this.fetch(`/skills/${skillId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Make an API request
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
      throw new SkillError(
        error.message || `API error: ${response.status}`,
        response.status === 404 ? 'NOT_FOUND' : 'API_ERROR',
        { status: response.status }
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Get from cache
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > (this.config.cacheTimeout || 60000)) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}

export interface Rating {
  id: string;
  skillId: string;
  rating: number;
  review?: string;
  authorWallet?: string;
  createdAt: number;
}
