// Secure credential manager for API keys and service credentials

// Interface for service credentials
export interface ServiceCredential {
  type: string;
  key: string;
  isValid: boolean;
  expiresAt?: Date;
}

// List of supported service types
export type ServiceType = 'gemini' | 'openai' | 'cohere' | 'anthropic';

/**
 * Get API key for a specific service
 * @param service The service to get the API key for
 * @returns The API key or null if not configured
 */
export function getApiKey(service: ServiceType): string | null {
  switch (service) {
    case 'gemini':
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
    case 'openai':
      return process.env.OPENAI_API_KEY || null;
    case 'cohere':
      return process.env.COHERE_API_KEY || null;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || null;
    default:
      return null;
  }
}

/**
 * Check if an API key is configured for a service
 * @param service The service to check
 * @returns True if API key is configured, false otherwise
 */
export function hasApiKey(service: ServiceType): boolean {
  return !!getApiKey(service);
}

/**
 * Get service credentials with validation
 * @param service The service to get credentials for
 * @returns ServiceCredential object with validation status
 */
export function getServiceCredential(service: ServiceType): ServiceCredential {
  const key = getApiKey(service);
  
  return {
    type: service,
    key: key || '',
    isValid: !!key && key.length > 10 // Basic validation
  };
}

/**
 * Get list of all configured services
 * @returns Array of service types that have configured API keys
 */
export function getConfiguredServices(): ServiceType[] {
  const services: ServiceType[] = ['gemini', 'openai', 'cohere', 'anthropic'];
  return services.filter(service => hasApiKey(service));
}

/**
 * Mask an API key for display
 * @param key The API key to mask
 * @returns Masked version of the API key
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '********';
  
  const visibleChars = 4;
  const firstPart = key.substring(0, visibleChars);
  const lastPart = key.substring(key.length - visibleChars);
  
  return `${firstPart}${'*'.repeat(Math.max(0, key.length - (visibleChars * 2)))}${lastPart}`;
}

/**
 * Validate that an API key meets the requirements for a specific service
 * @param service The service to validate for
 * @param key The API key to validate
 * @returns True if the key is valid, false otherwise
 */
export function validateApiKey(service: ServiceType, key: string): boolean {
  if (!key) return false;
  
  switch (service) {
    case 'gemini':
      // Gemini API keys are typically longer than 25 characters
      return key.length > 25;
    case 'openai':
      // OpenAI API keys start with 'sk-' and are longer than 40 characters
      return key.startsWith('sk-') && key.length > 40;
    case 'anthropic':
      // Anthropic API keys typically start with 'sk-ant-' and are long
      return key.startsWith('sk-ant-') && key.length > 40;
    case 'cohere':
      // Cohere API keys are typically longer than 30 characters
      return key.length > 30;
    default:
      return false;
  }
}

/**
 * Use this in development only to verify API keys are working
 * Never expose this function in production code or client-side
 */
export function _DEV_logAvailableCredentials(): void {
  if (process.env.NODE_ENV !== 'development') {
    console.error('This function is for development use only');
    return;
  }
  
  const services = ['gemini', 'openai', 'cohere', 'anthropic'] as ServiceType[];
  
  console.log('Available API credentials:');
  services.forEach(service => {
    const credential = getServiceCredential(service);
    console.log(`- ${service}: ${credential.isValid ? 'Configured' : 'Not configured'}`);
    if (credential.isValid) {
      console.log(`  Key: ${maskApiKey(credential.key)}`);
    }
  });
} 