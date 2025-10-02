const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const alphabetLength = alphabet.length;

export function nanoid(size = 10) {
  let id = '';
  crypto.getRandomValues(new Uint8Array(size)).forEach((value) => {
    id += alphabet[value % alphabetLength];
  });
  return id;
}
