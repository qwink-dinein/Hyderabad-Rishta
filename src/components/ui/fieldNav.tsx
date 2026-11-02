import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import type React from 'react';

/**
 * Field-to-field navigation for the keyboard bar (↑ ↓ on long forms). Text fields register themselves
 * in the order they mount (top to bottom); the bar moves focus to the previous / next one.
 */
type Input = React.ComponentRef<typeof TextInput>;
type Entry = { id: number; ref: RefObject<Input | null> };
type Nav = {
  register: (ref: RefObject<Input | null>) => () => void;
  focused: (ref: RefObject<Input | null>) => void;
  move: (d: -1 | 1) => void;
  count: number;
  index: number;
};
const Ctx = createContext<Nav | null>(null);
let seq = 0;

export function FieldNavProvider({ children }: { children: ReactNode }) {
  const list = useRef<Entry[]>([]);
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(-1);
  // Stable functions (fields register once); count / index only drive the bar's display.
  const register = useCallback((ref: RefObject<Input | null>) => {
    const e = { id: ++seq, ref };
    list.current = [...list.current, e];
    setCount(list.current.length);
    return () => {
      list.current = list.current.filter((x) => x !== e);
      setCount(list.current.length);
    };
  }, []);
  const focused = useCallback((ref: RefObject<Input | null>) => setIndex(list.current.findIndex((x) => x.ref === ref)), []);
  const move = useCallback((d: -1 | 1) => {
    const i = list.current.findIndex((x) => x.ref.current?.isFocused());
    list.current[(i < 0 ? 0 : i) + d]?.ref.current?.focus();
  }, []);
  const value = useMemo<Nav>(() => ({ register, focused, move, count, index }), [register, focused, move, count, index]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFieldNav = () => useContext(Ctx);
