import { useContext } from 'react';
import { ActiveMowerContext, type ActiveMowerContextShape } from '../contexts/ActiveMowerContext';

export function useActiveMowerContext(): ActiveMowerContextShape {
  const ctx = useContext(ActiveMowerContext);
  if (!ctx) throw new Error('useActiveMowerContext must be used inside <ActiveMowerProvider>');
  return ctx;
}
