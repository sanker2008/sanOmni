import { remove, writeFile } from '@tauri-apps/plugin-fs';
import { ipImageApi } from '@/services/tauri';
import { useIpImageStore, type IpImageWithRelations } from '@/stores';
import { convertFileSrc } from '@tauri-apps/api/core';

export async function convertIpImageToWebp(image: IpImageWithRelations, quality: number = 0.9): Promise<IpImageWithRelations> {
  if (image.format?.toLowerCase() === 'webp') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to WebP using canvas
  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await webpBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  const newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.webp');
  const newFilename = image.filename.replace(/\.[^/.]+$/, '.webp');
  const newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.webp');

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await ipImageApi.updateFile({
      ip_image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'WEBP',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useIpImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup webp file after DB error', e);
      }
    }
    throw error;
  }
}

export async function convertFileToWebp(file: File, quality: number = 0.9): Promise<File> {
  if (file.type === 'image/webp') {
    return file;
  }

  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = url;
  });

  const originalName = file.name;
  const lastDot = originalName.lastIndexOf('.');
  const newName = lastDot !== -1 
    ? originalName.substring(0, lastDot) + '.webp' 
    : originalName + '.webp';
    
  return new File([webpBlob], newName, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

export async function convertIpImageToPng(image: IpImageWithRelations): Promise<IpImageWithRelations> {
  if (image.format?.toLowerCase() === 'png') {
    return image;
  }

  // Fetch the image to get a Blob
  const src = convertFileSrc(image.absolute_path);
  const response = await fetch(src);
  const blob = await response.blob();
  
  // Convert blob to PNG using canvas
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = URL.createObjectURL(blob);
  });

  const buffer = await pngBlob.arrayBuffer();
  const uint8Array = new Uint8Array(buffer);

  // Generate new paths
  const oldPath = image.absolute_path;
  const newAbsolutePath = oldPath.replace(/\.[^/.]+$/, '.png');
  const newFilename = image.filename.replace(/\.[^/.]+$/, '.png');
  const newRelativePath = image.relative_path.replace(/\.[^/.]+$/, '.png');

  // Write new file
  await writeFile(newAbsolutePath, uint8Array);

  try {
    // Update DB
    const updatedImage = await ipImageApi.updateFile({
      ip_image_id: image.id,
      new_filename: newFilename,
      new_absolute_path: newAbsolutePath,
      new_relative_path: newRelativePath,
      new_format: 'PNG',
      new_file_size: uint8Array.length,
    });

    // Delete old file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(oldPath);
      } catch (e) {
        console.error('Failed to remove old file after conversion', e);
      }
    }

    // Update store
    useIpImageStore.getState().updateImage(image.id, updatedImage as any);

    return updatedImage as any;
  } catch (error) {
    // If DB update fails, clean up the new file
    if (oldPath !== newAbsolutePath) {
      try {
        await remove(newAbsolutePath);
      } catch (e) {
        console.error('Failed to cleanup png file after DB error', e);
      }
    }
    throw error;
  }
}

export async function convertFileToPng(file: File): Promise<File> {
  if (file.type === 'image/png') {
    return file;
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion'));
    };
    img.src = url;
  });

  const originalName = file.name;
  const lastDot = originalName.lastIndexOf('.');
  const newName = lastDot !== -1 
    ? originalName.substring(0, lastDot) + '.png' 
    : originalName + '.png';
    
  return new File([pngBlob], newName, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
