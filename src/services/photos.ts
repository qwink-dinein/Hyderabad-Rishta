import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { AppError } from './backend';
import { dataUriBytes, MAX_PHOTO_BYTES, uploadProblem } from '@/domain/security';

/** Longest edge kept: sharp on any phone screen, ~300–600 KB as JPEG. */
const MAX_EDGE = 1600;

/**
 * Accepts originals up to 5 MB, then shrinks them on the phone before anything is stored or uploaded:
 * resized to at most 1600 px, re-encoded as JPEG (which also drops EXIF, incl. GPS location).
 * Web gets a data URI; phones get a local file.
 */
export type PhotoCrop = { originX: number; originY: number; width: number; height: number };

export async function preparePhoto(a: ImagePickerAsset, crop?: PhotoCrop): Promise<string> {
  const problem = uploadProblem(a);
  if (problem) throw new AppError('validation', problem);
  // The member's framing from the adjust screen (in the picture's own pixels), applied before resizing.
  const box = crop
    ? { originX: Math.max(0, Math.round(crop.originX)), originY: Math.max(0, Math.round(crop.originY)), width: Math.round(crop.width), height: Math.round(crop.height) }
    : undefined;
  const w = box ? box.width : a.width;
  const h = box ? box.height : a.height;
  const attempts = [
    { edge: MAX_EDGE, compress: 0.72 },
    { edge: 1200, compress: 0.55 },
  ];
  for (const { edge, compress } of attempts) {
    const ctx = ImageManipulator.manipulate(a.uri);
    if (box) ctx.crop(box);
    const longest = Math.max(w || 0, h || 0);
    if (!longest || longest > edge) ctx.resize(w >= h ? { width: edge } : { height: edge });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress, base64: Platform.OS === 'web' });
    const uri = out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri;
    if (!uri.startsWith('data:') || dataUriBytes(uri) <= MAX_PHOTO_BYTES) return uri;
  }
  throw new AppError('validation', 'v.photoTooLarge');
}

/** Turns the picture a quarter turn clockwise (adjust screen "Rotate"); returns the new picture. */
export async function rotatePhoto(a: { uri: string; width: number; height: number }) {
  const img = await ImageManipulator.manipulate(a.uri).rotate(90).renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.95, base64: Platform.OS === 'web' });
  return { uri: out.base64 ? `data:image/jpeg;base64,${out.base64}` : out.uri, width: out.width, height: out.height };
}
