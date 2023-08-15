import AWS from 'aws-sdk';

export const getRekoResults = async (base64Image: string) => {
  const client = new AWS.Rekognition();
  const params = {
    Image: {
      Bytes: Buffer.from(base64Image, 'base64'),
    },
  };
  return client.detectText(params).promise();
};
