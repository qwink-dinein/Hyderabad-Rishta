import type React from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';

/**
 * How much of a screen the on-screen keyboard covers (owner report 2026-11-02: on Android the keyboard
 * hid the Next button). With Android edge-to-edge the window is no longer resized for the keyboard, so
 * screens add this as bottom padding: the footer button then sits right on top of the keyboard. It
 * measures the real overlap, so a phone that does resize the window gets 0 (never double padding).
 * No keyboard events on web: always 0 there.
 */
export function useKeyboardOverlap(ref: React.RefObject<React.ComponentRef<typeof View> | null>) {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      const top = e.endCoordinates.screenY;
      const node = ref.current;
      if (!node) return setOverlap(e.endCoordinates.height);
      node.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - top))));
    });
    const hide = Keyboard.addListener(hideEvt, () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}
