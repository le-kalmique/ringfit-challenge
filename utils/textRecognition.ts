import { getRekoResults } from '../requests';

export const getTrainingData = async (base64Image: string) => {
  try {
    const textRecognitionResults = await getRekoResults(base64Image);
    const textDetections = textRecognitionResults.TextDetections;
    const trainingData = textDetections.map((textDetection) => {
      return {
        text: textDetection.DetectedText,
        boundingBox: textDetection.Geometry.BoundingBox,
      };
    });

    const timePattern =
      /(([\d|O]+) ?hr\.? ?)?(([\d|O]+) ?min\.? ?)?(([\d|O]+) ?sec\.?)?/i;
    const caloriesPattern = /^(\d+(\. ?\d+)?)\s*(Cal|cal|kcal)$/i;
    const distancePattern = /(\d+(\. ?\d+)?)\s*(?:mi[^n]\.?|km\.?)/;

    const timeEntry = trainingData.find((entry) => entry.text.includes('sec'));
    const caloriesEntry = trainingData.find((entry) =>
      entry.text.match(caloriesPattern)
    );
    const distanceEntry = trainingData.find((entry) =>
      entry.text.match(distancePattern)
    );

    console.log(
      'Text entries:',
      timeEntry?.text,
      caloriesEntry?.text,
      distanceEntry?.text
    );

    const fixedText = timeEntry.text.replace(/O/g, '0');
    const timeMatch = fixedText.match(timePattern);
    const [, , hours, , minutes, , seconds] = timeMatch;

    const [, calories] = caloriesEntry.text.match(caloriesPattern);

    const [, distance] = distanceEntry.text.match(distancePattern);
    const distanceUnit = distanceEntry.text.match(/mi\.?|km\.?/i)[0];
    const distanceValue = parseFloat(distance.replace(/\s/g, ''));
    const distanceInKm = distanceUnit.includes('mi')
      ? distanceValue * 1.60934
      : distanceValue;

    const data = {
      hours: hours ? parseInt(hours) : 0,
      minutes: minutes ? parseInt(minutes) : 0,
      seconds: seconds ? parseInt(seconds) : 0,
      kcal: parseFloat(calories.replace(/\s/g, '')),
      distance: distanceInKm,
    };

    return data;
  } catch (err) {
    throw new Error(err);
  }
};
