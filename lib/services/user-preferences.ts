'use client';

import { ServiceType } from '@/lib/credentials';

// Types for user preferences
export interface UserPreferences {
  defaultLLM: ServiceType;
  llmSettings: {
    [key in ServiceType]?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
    };
  };
}

// Default user preferences
export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultLLM: 'gemini',
  llmSettings: {
    gemini: {
      temperature: 0.7,
      maxTokens: 500,
      topP: 0.95,
      topK: 40
    }
  }
};

// Keys for localStorage
const PREFERENCES_KEY = 'macru_user_preferences';

/**
 * Get user preferences from localStorage
 * @returns UserPreferences object
 */
export function getUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const storedPrefs = localStorage.getItem(PREFERENCES_KEY);
    if (!storedPrefs) return DEFAULT_PREFERENCES;
    
    const parsedPrefs = JSON.parse(storedPrefs) as Partial<UserPreferences>;
    
    // Ensure we have all the required fields by merging with defaults
    return {
      ...DEFAULT_PREFERENCES,
      ...parsedPrefs,
      // Ensure llmSettings is properly merged
      llmSettings: {
        ...DEFAULT_PREFERENCES.llmSettings,
        ...parsedPrefs.llmSettings
      }
    };
  } catch (error) {
    console.error('Error retrieving user preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Set user preferences in localStorage
 * @param preferences UserPreferences to store
 */
export function setUserPreferences(preferences: UserPreferences): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving user preferences:', error);
  }
}

/**
 * Update specific preference fields
 * @param updates Partial preferences to update
 */
export function updateUserPreferences(updates: Partial<UserPreferences>): UserPreferences {
  const currentPrefs = getUserPreferences();
  
  const updatedPrefs = {
    ...currentPrefs,
    ...updates,
    // Ensure proper merging of nested objects
    llmSettings: updates.llmSettings 
      ? { ...currentPrefs.llmSettings, ...updates.llmSettings }
      : currentPrefs.llmSettings
  };
  
  setUserPreferences(updatedPrefs);
  return updatedPrefs;
}

/**
 * Get the default LLM model selected by the user
 * @returns ServiceType string
 */
export function getDefaultLLM(): ServiceType {
  return getUserPreferences().defaultLLM;
}

/**
 * Set the default LLM model
 * @param model ServiceType to set as default
 */
export function setDefaultLLM(model: ServiceType): void {
  updateUserPreferences({ defaultLLM: model });
}

/**
 * Get settings for a specific LLM model
 * @param model ServiceType to get settings for
 * @returns Settings object or undefined
 */
export function getLLMSettings(model: ServiceType) {
  return getUserPreferences().llmSettings[model];
}

/**
 * Update settings for a specific LLM model
 * @param model ServiceType to update settings for
 * @param settings Settings to update
 */
export function updateLLMSettings(
  model: ServiceType, 
  settings: Partial<UserPreferences['llmSettings'][ServiceType]>
): void {
  const currentPrefs = getUserPreferences();
  const currentModelSettings = currentPrefs.llmSettings[model] || {};
  
  updateUserPreferences({
    llmSettings: {
      ...currentPrefs.llmSettings,
      [model]: {
        ...currentModelSettings,
        ...settings
      }
    }
  });
} 