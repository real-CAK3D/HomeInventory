// Web NFC works in Chrome on Android. Elsewhere we fall back to copy-the-link instructions.
export const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

export async function writeTag(url, signal) {
  const reader = new window.NDEFReader();
  await reader.write({ records: [{ recordType: 'url', data: url }] }, { signal, overwrite: true });
}

export function readTag(signal) {
  return new Promise((resolve, reject) => {
    const reader = new window.NDEFReader();
    reader.onreading = (event) => {
      const decoder = new TextDecoder();
      for (const record of event.message.records) {
        if (record.recordType === 'url' || record.recordType === 'absolute-url') return resolve({ url: decoder.decode(record.data), serial: event.serialNumber });
        if (record.recordType === 'text') return resolve({ text: decoder.decode(record.data), serial: event.serialNumber });
      }
      resolve({ empty: true, serial: event.serialNumber });
    };
    reader.onreadingerror = () => reject(new Error('Could not read that tag. Try holding it still against the back of the phone.'));
    reader.scan({ signal }).catch(reject);
  });
}
