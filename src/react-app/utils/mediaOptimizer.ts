/**
 * Utilitários para otimização de mídia para chamadas de IA
 * Preparado para futura migração para Cloudflare R2
 */

export interface OptimizedMedia {
  url: string;
  size_mb: number;
  optimized: boolean;
  original_size_mb?: number;
}

export interface MediaOptimizationOptions {
  maxSizeMB?: number;
  maxImages?: number;
  imageQuality?: number;
  maxDimension?: number;
}

const DEFAULT_OPTIONS: Required<MediaOptimizationOptions> = {
  maxSizeMB: 2,
  maxImages: 3,
  imageQuality: 0.7,
  maxDimension: 1024
};

/**
 * Otimiza uma imagem base64 para uso em IA
 */
export async function optimizeImageForAI(
  base64Data: string,
  options: MediaOptimizationOptions = {}
): Promise<OptimizedMedia> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate original size
        const originalSizeMB = (base64Data.length * 3) / 4 / (1024 * 1024);
        
        // If already small enough, return as is
        if (originalSizeMB <= opts.maxSizeMB) {
          resolve({
            url: base64Data,
            size_mb: originalSizeMB,
            optimized: false,
            original_size_mb: originalSizeMB
          });
          return;
        }
        
        // Calculate new dimensions
        const { width, height } = img;
        const aspectRatio = width / height;
        
        let newWidth = width;
        let newHeight = height;
        
        if (Math.max(width, height) > opts.maxDimension) {
          if (width > height) {
            newWidth = opts.maxDimension;
            newHeight = opts.maxDimension / aspectRatio;
          } else {
            newHeight = opts.maxDimension;
            newWidth = opts.maxDimension * aspectRatio;
          }
        }
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Cannot create canvas context');
        }
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw resized image
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Convert back to base64 with compression
        const optimizedData = canvas.toDataURL('image/jpeg', opts.imageQuality);
        const optimizedSizeMB = (optimizedData.length * 3) / 4 / (1024 * 1024);
        
        resolve({
          url: optimizedData,
          size_mb: optimizedSizeMB,
          optimized: true,
          original_size_mb: originalSizeMB
        });
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for optimization'));
    };
    
    img.src = base64Data;
  });
}

/**
 * Otimiza um conjunto de mídias para uso em IA
 */
export async function optimizeMediaSetForAI(
  mediaData: any[],
  options: MediaOptimizationOptions = {}
): Promise<{ optimizedMedia: any[], totalSizeMB: number, optimizationReport: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const optimizedMedia: any[] = [];
  let totalSizeMB = 0;
  let optimizationReport = '';
  
  // Separate images from other media
  const images = mediaData.filter(m => m.media_type === 'image' && m.file_url.startsWith('data:image/'));
  const otherMedia = mediaData.filter(m => !(m.media_type === 'image' && m.file_url.startsWith('data:image/')));
  
  // Limit number of images
  const imagesToProcess = images.slice(0, opts.maxImages);
  
  if (images.length > opts.maxImages) {
    optimizationReport += `Limitado a ${opts.maxImages} imagem(s) de ${images.length} disponíveis. `;
  }
  
  // Optimize each image
  for (const image of imagesToProcess) {
    try {
      const optimized = await optimizeImageForAI(image.file_url, options);
      
      optimizedMedia.push({
        ...image,
        file_url: optimized.url,
        optimized: optimized.optimized,
        original_size_mb: optimized.original_size_mb,
        size_mb: optimized.size_mb
      });
      
      totalSizeMB += optimized.size_mb;
      
      if (optimized.optimized) {
        const reduction = ((optimized.original_size_mb! - optimized.size_mb) / optimized.original_size_mb! * 100).toFixed(1);
        optimizationReport += `${image.file_name}: reduzida ${reduction}%. `;
      }
      
    } catch (error) {
      console.warn(`Failed to optimize image ${image.file_name}:`, error);
      optimizationReport += `${image.file_name}: falha na otimização. `;
    }
  }
  
  // Add other media as-is (for context)
  optimizedMedia.push(...otherMedia.map(m => ({ ...m, optimized: false })));
  
  return {
    optimizedMedia,
    totalSizeMB,
    optimizationReport: optimizationReport.trim()
  };
}

/**
 * Valida se o conjunto de mídias está dentro dos limites para IA
 */
export function validateMediaForAI(mediaData: any[]): {
  valid: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  const images = mediaData.filter(m => m.media_type === 'image');
  let totalEstimatedSizeMB = 0;
  
  // Calculate estimated total size
  for (const media of images) {
    if (media.file_url && media.file_url.startsWith('data:')) {
      const sizeMB = (media.file_url.length * 3) / 4 / (1024 * 1024);
      totalEstimatedSizeMB += sizeMB;
      
      if (sizeMB > 5) {
        issues.push(`${media.file_name} é muito grande (${sizeMB.toFixed(1)}MB)`);
      }
    }
  }
  
  if (images.length > 5) {
    issues.push(`Muitas imagens (${images.length})`);
    recommendations.push('Limite a 3-5 imagens por análise para melhor performance');
  }
  
  if (totalEstimatedSizeMB > 10) {
    issues.push(`Tamanho total muito grande (${totalEstimatedSizeMB.toFixed(1)}MB)`);
    recommendations.push('Reduza o tamanho ou número de imagens');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    recommendations
  };
}

/**
 * Preparado para futura integração com Cloudflare R2
 */
export async function uploadToR2(
  file: File | Blob,
  filename: string,
  _options: { bucket?: string; path?: string } = {}
): Promise<{ url: string; success: boolean; error?: string }> {
  // Placeholder for future R2 integration
  console.log('R2 upload would happen here for:', filename);
  
  // For now, return the original blob URL or base64
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        url: reader.result as string,
        success: true
      });
    };
    reader.onerror = () => {
      resolve({
        url: '',
        success: false,
        error: 'Failed to process file'
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Gera URLs de mídia preparadas para chamadas de IA
 */
export function prepareMediaForAI(mediaData: any[]): {
  aiReadyMedia: any[];
  excludedMedia: any[];
  processingNotes: string[];
} {
  const aiReadyMedia: any[] = [];
  const excludedMedia: any[] = [];
  const processingNotes: string[] = [];
  
  for (const media of mediaData) {
    if (media.media_type === 'image' && media.file_url.startsWith('data:image/')) {
      // Images can be directly analyzed by AI
      aiReadyMedia.push({
        ...media,
        ai_processable: true,
        processing_method: 'direct_vision_api'
      });
      processingNotes.push(`Imagem ${media.file_name} será analisada visualmente pela IA`);
      
    } else if (media.media_type === 'audio') {
      // Audio files need special handling - add contextual note
      aiReadyMedia.push({
        ...media,
        ai_processable: false,
        processing_method: 'contextual_description'
      });
      processingNotes.push(`Áudio ${media.file_name} será considerado como contexto textual`);
      
    } else if (media.media_type === 'video') {
      // Video files need special handling - add contextual note  
      aiReadyMedia.push({
        ...media,
        ai_processable: false,
        processing_method: 'contextual_description'
      });
      processingNotes.push(`Vídeo ${media.file_name} será considerado como contexto textual`);
      
    } else {
      // Other media types not directly processable
      excludedMedia.push(media);
      processingNotes.push(`${media.file_name} não pode ser processado diretamente pela IA`);
    }
  }
  
  return {
    aiReadyMedia,
    excludedMedia,
    processingNotes
  };
}
