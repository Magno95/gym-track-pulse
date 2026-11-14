import { useEffect, useSyncExternalStore } from 'react';
import { Image, type ImageProps, type ImageURISource } from 'react-native';
import { imageCache, remoteImageSource } from '../image-cache';

type Props = ImageProps;

/** Native/bundled assets stay native; remote exercise photos are only shown from Documents. */
export function PersistentImage({ source, ...props }: Props) {
  const remote = remoteImageSource(source);
  if (remote) return <DownloadedImage key={remote.uri} source={remote} {...props} />;
  return <Image source={source} {...props} />;
}

function DownloadedImage({ source, ...props }: Omit<Props, 'source'> & { source: ImageURISource }) {
  const url = source.uri!;
  const uri = useSyncExternalStore(imageCache.subscribe, () => imageCache.peek(url));
  useEffect(() => {
    // Keep subscribed after a network failure: prefetch retries on reconnection.
    void imageCache.resolve(url).catch(() => {});
  }, [url]);
  return <Image {...props} source={uri ? { ...source, uri } : undefined} />;
}
