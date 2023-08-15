import axios from 'axios';

export const getImage = async (imageUrl: string) => {
  const image = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
  });
  const returnedB64 = Buffer.from(image.data).toString('base64');
  return returnedB64;
};
