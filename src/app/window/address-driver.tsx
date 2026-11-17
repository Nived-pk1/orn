/** The address code, as the lazy chunk the gate loads (step 8.4g, size): it draws nothing and keeps the address and the app together. */
import { useWindowAddress } from './use-window-address';

export function AddressDriver(props: Parameters<typeof useWindowAddress>[0]) {
  useWindowAddress(props);
  return null;
}
