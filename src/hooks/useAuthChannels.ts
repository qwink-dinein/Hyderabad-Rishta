import { useQuery } from '@tanstack/react-query';
import { backend } from '@/services';

/** Which channels can carry a login code. SMS appears only once the team has switched it on. */
export function useAuthChannels() {
  const { data } = useQuery({ queryKey: ['authChannels'], queryFn: () => backend.getAuthChannels(), staleTime: 5 * 60_000 });
  return data ?? { whatsapp: true, sms: false };
}
