import dotenv from 'dotenv';
import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import { Telegraf, Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram.js';

import { UserEntry } from './models';
import { getImage } from './requests';
import {
  formatTime,
  formatTimeShort,
  getTrainingData,
  getUsername,
} from './utils';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export interface UserEntry {
  hours: number;
  minutes: number;
  seconds: number;
  kcal: number;
  distance: number;
  distanceUnit?: string;
}

mongoose.connect(
  `mongodb+srv://bot:${process.env.MONGO_PASSWORD}@main.us253pi.mongodb.net/`,
  {}
);
AWS.config.update({ region: 'us-east-1' });

const db = mongoose.connection;
const bot = new Telegraf(process.env.BOT_TOKEN);

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

bot.command('ringfit', async (ctx: Context) => {
  // @ts-ignore
  const inputText = ctx.message?.text;
  const replyMessageId = ctx.message?.message_id;
  const userId = ctx.message?.from?.id.toString();
  const chatId = ctx.message?.chat?.id.toString(); // Get chat ID
  const username = getUsername(ctx.message?.from, userId);

  if (inputText) {
    const match = inputText.match(
      /(?:(\d+h)?\s?(?:(\d+m)?\s?(?:(\d+s)?)?)?,?\s?(\d+(?:\.\d+)?)\s?(kcal|cal),?\s?([\d.]+)\s?(km|mi))/
    );

    if (match) {
      const [
        _,
        hours,
        minutes,
        seconds,
        kcal,
        kcalUnit,
        distance,
        distanceUnit,
      ] = match;

      const parsedHours = hours ? parseInt(hours) : 0;
      const parsedMinutes = minutes ? parseInt(minutes) : 0;
      const parsedSeconds = seconds ? parseInt(seconds) : 0;

      const kcalValue = parseFloat(kcal);
      const distanceValue = parseFloat(distance);

      // Convert distance to kilometers if in miles
      const distanceInKm =
        distanceUnit === 'mi' ? distanceValue * 1.60934 : distanceValue;

      const entry = new UserEntry({
        userId,
        chatId,
        username,
        hours: parsedHours,
        minutes: parsedMinutes,
        seconds: parsedSeconds,
        kcal: kcalValue,
        distance: distanceInKm.toFixed(2),
      });

      const additional = distanceUnit === 'mi' ? ', клятий імперець' : '';

      try {
        const res = await entry.save();
        console.log('Entry saved successfully:', res);
        ctx.reply(
          `Тренування додано${additional}! \n ${parsedHours}г ${parsedMinutes}хв ${parsedSeconds}с, ${entry.kcal} ккал, ${entry.distance} км`,
          { reply_to_message_id: replyMessageId }
        );
      } catch (err) {
        ctx.reply('Error saving entry:', err);
      }
    } else {
      await ctx.reply(
        'Неправильний формат. Приклад: /ringfit 1h 26m 36s, 155 kcal, 2.5 km'
      );
    }
  }
});

bot.command('myresults', async (ctx: Context) => {
  const userId = ctx.message?.from?.id.toString();
  const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

  try {
    const userEntries = await UserEntry.find({ userId, chatId });
    if (userEntries.length === 0) {
      ctx.reply('Ти ще не додав жодного тренування!');
      return;
    }
    const totalTime = userEntries.reduce(
      (total, entry) =>
        total + entry.hours * 3600 + entry.minutes * 60 + entry.seconds,
      0
    );
    const totalKcal = userEntries.reduce(
      (total, entry) => total + entry.kcal,
      0
    );
    const totalDistance = userEntries.reduce(
      (total, entry) => total + entry.distance,
      0
    );

    const avgTimeInSeconds = totalTime / userEntries.length;
    const avgTimeFormatted = formatTime(avgTimeInSeconds); // Implement this function
    const totalTimeFormatted = formatTime(totalTime);
    const avgDistance = totalDistance / userEntries.length;
    const avgKcal = Math.round(totalKcal / userEntries.length);

    ctx.reply(
      `
@${ctx.message?.from?.username}, твої результати
🎯 Всього занять: ${userEntries.length}\n
⏳ Загальний час: ${totalTimeFormatted}
      Середній час: ${avgTimeFormatted}
💪 Всього калорій: ${totalKcal.toFixed(2)}
      Середня кількість калорій: ${avgKcal.toFixed(2)}
🏃 Загальна відстань: ${totalDistance.toFixed(2)} км
      Середня відстань: ${avgDistance.toFixed(2)} км
      `
    );
  } catch (err) {
    ctx.reply('Error retrieving entries:', err);
    console.error('Error retrieving entries:', err);
    return;
  }
});

const getRatings = async (chatId: string, top?: number) => {
  // RATINGS BY TOTAL TRAININGS
  const ratings = await UserEntry.aggregate([
    { $match: { chatId } }, // Consider entries from the same chat
    {
      $group: {
        _id: '$userId',
        totalTrainings: { $sum: 1 },
        username: { $first: '$username' },
      },
    },
    { $sort: { totalTrainings: -1 } },
    { $limit: top || 30 },
  ]).exec();

  // RATINGS BY AVG TIME
  const ratingsByTime = await UserEntry.aggregate([
    { $match: { chatId } }, // Consider entries from the same chat
    {
      $group: {
        _id: '$userId',
        avgTime: {
          $avg: {
            $sum: [
              // Convert hours, minutes and seconds to seconds
              { $multiply: ['$hours', 3600] },
              { $multiply: ['$minutes', 60] },
              '$seconds',
            ],
          },
        },
        username: { $first: '$username' },
      },
    },
    { $sort: { avgTime: -1 } },
    { $limit: top || 30 },
  ]).exec();

  // RATINGS BY AVG KCAL
  const ratingsByKcal = await UserEntry.aggregate([
    { $match: { chatId } }, // Consider entries from the same chat
    {
      $group: {
        _id: '$userId',
        avgKcal: { $avg: '$kcal' },
        username: { $first: '$username' },
      },
    },
    { $sort: { avgKcal: -1 } },
    { $limit: top || 30 },
  ]).exec();

  // RATINGS BY TOTAL DISTANCE
  const ratingsByDistance = await UserEntry.aggregate([
    { $match: { chatId } }, // Consider entries from the same chat
    {
      $group: {
        _id: '$userId',
        totalDistance: { $sum: '$distance' },
        username: { $first: '$username' },
      },
    },
    { $sort: { totalDistance: -1 } },
    { $limit: top || 30 },
  ]).exec();

  return {
    ratings,
    ratingsByTime,
    ratingsByKcal,
    ratingsByDistance,
  };
};

bot.command('fullratings', async (ctx: Context) => {
  try {
    const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

    const withMedal = (rating: number) =>
      rating === 0 ? '🥇' : rating === 1 ? '🥈' : rating === 2 ? '🥉' : '';
    const withLineBreak = (rating: number) => (rating < 3 ? '\n' : '');

    const { ratings, ratingsByTime, ratingsByDistance, ratingsByKcal } =
      await getRatings(chatId);

    const ratingText = ratings.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username} - ${
          rating.totalTrainings
        }${withLineBreak(index)}`
    );

    const ratingMessage = '🏆 КІЛЬКІСТЬ ТРЕНУВАНЬ\n\n' + ratingText.join('\n');

    const ratingByTimeText = ratingsByTime.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username} - ${formatTime(
          rating.avgTime
        )}${withLineBreak(index)}`
    );

    const ratingByTimeMessage =
      '⏳ СЕРЕДНІЙ ЧАС\n\n' + ratingByTimeText.join('\n');

    const ratingByKcalText = ratingsByKcal.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${
          rating.username
        } - ${rating.avgKcal.toFixed(2)} ккал${withLineBreak(index)}`
    );

    const ratingsByKcalMessage =
      '💪 СЕРЕДНЯ КІЛЬКІСТЬ КАЛОРІЙ\n\n' + ratingByKcalText.join('\n');

    const ratingByDistanceText = ratingsByDistance.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${
          rating.username
        } - ${rating.totalDistance.toFixed(2)} км${withLineBreak(index)}`
    );

    const ratingByDistanceMessage =
      '🏃 ЗАГАЛЬНА ВІДСТАНЬ\n\n' + ratingByDistanceText.join('\n');

    if (ratings.length === 0) {
      ctx.reply('Ніхто не додав жодного тренування! 😨');
      return;
    }

    ctx.reply(`Рейтинги:`);
    await ctx.reply(`${ratingMessage}`);
    await ctx.reply(`${ratingByTimeMessage}`);
    await ctx.reply(`${ratingsByKcalMessage}`);
    await ctx.reply(`${ratingByDistanceMessage}`);
  } catch (err) {
    ctx.reply('Error calculating ratings.');
    console.error('Error calculating ratings:', err);
    return;
  }
});

bot.command('ratings', async (ctx: Context) => {
  try {
    const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

    const withMedal = (rating: number) =>
      rating === 0 ? '🥇' : rating === 1 ? '🥈' : rating === 2 ? '🥉' : '';

    const { ratings, ratingsByTime, ratingsByDistance, ratingsByKcal } =
      await getRatings(chatId, 5);

    const ratingText = ratings.map(
      (rating, index) =>
        `${index + 1}. ${rating.username} - ${
          rating.totalTrainings
        } ${withMedal(index)}`
    );
    const timeRatingText = ratingsByTime.map(
      (rating, index) =>
        `${index + 1}. ${rating.username} - ${formatTimeShort(
          rating.avgTime
        )} ${withMedal(index)}`
    );
    const distanceRatingText = ratingsByDistance.map(
      (rating, index) =>
        `${index + 1}. ${rating.username} - ${rating.totalDistance.toFixed(
          2
        )} км ${withMedal(index)}`
    );
    const kcalRatingText = ratingsByKcal.map(
      (rating, index) =>
        `${index + 1}. ${rating.username} - ${rating.avgKcal.toFixed(
          2
        )} ккал ${withMedal(index)}`
    );

    let ratingMessage = '🏆 КІЛЬКІСТЬ ТРЕНУВАНЬ\n' + ratingText.join('\n');
    ratingMessage +=
      '\n\n🏃 ЗАГАЛЬНА ВІДСТАНЬ\n' + distanceRatingText.join('\n');
    ratingMessage += '\n\n⏳ СЕРЕДНІЙ ЧАС\n' + timeRatingText.join('\n');
    ratingMessage +=
      '\n\n💪 СЕРЕДНЯ КІЛЬКІСТЬ КАЛОРІЙ\n' + kcalRatingText.join('\n');

    if (ratings.length === 0) {
      ctx.reply('Ніхто не додав жодного тренування! 😨');
      return;
    }

    await ctx.reply(`${ratingMessage}`);
  } catch (err) {
    ctx.reply('Помилка при обрахунку рейтингу.');
    console.error('Error calculating ratings:', err);
    return;
  }
});

bot.command('updateusername', async (ctx: Context) => {
  const userId = ctx.message?.from?.id.toString();
  const newUsername = getUsername(ctx.message?.from, userId);

  try {
    await UserEntry.updateMany(
      { userId: userId },
      { $set: { username: newUsername } }
    );
    ctx.reply('Username updated successfully!');
  } catch (err) {
    console.error('Error updating username:', err);
    ctx.reply('Error updating username:', err);
    return;
  }
});

bot.command('removelatest', async (ctx: Context) => {
  const userId = ctx.message?.from?.id.toString();
  const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

  try {
    const entry = await UserEntry.findOneAndDelete({ userId, chatId }).sort({
      _id: -1,
    });
    if (entry) {
      ctx.reply('Останнє тренування видалено!');
    } else {
      ctx.reply('Ти ще не додав жодного тренування!');
    }
  } catch (err) {
    console.error('Error deleting entry:', err);
    ctx.reply('Error deleting entry:', err);
    return;
  }
});

bot.on('inline_query', async (ctx) => {
  const userId = ctx.inlineQuery.from.id.toString();

  // Fetch 5 latest entries from the database for the user
  const entries = await UserEntry.find({ userId }).sort({ _id: -1 }).limit(5);

  const withIcon = (kcal: number) =>
    kcal < 100 ? '🎯' : kcal < 200 ? '💪' : kcal < 300 ? '🥇' : '🏆';

  const results = entries.map((entry, index) => ({
    type: 'article',
    id: index.toString(),
    title: `${withIcon(entry.kcal)} ${formatTime(
      entry.hours * 3600 + entry.minutes * 60 + entry.seconds
    )} - ${entry.kcal} ккал`,
    description: `Відстань: ${entry.distance.toFixed(2)} км\nДата: ${entry._id
      .getTimestamp()
      .toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      })}
    `,
    input_message_content: {
      message_text: `Тренування за ${entry._id
        .getTimestamp()
        .toLocaleDateString('uk-UA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      \n${formatTime(
        entry.hours * 3600 + entry.minutes * 60 + entry.seconds
      )}\n${entry.kcal} ккал\nВідстань: ${entry.distance.toFixed(2)} км`,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.answerInlineQuery(results as any);
});

bot.on('message', async (ctx: Context) => {
  const message = ctx.message as Message.PhotoMessage;
  if (message?.photo && message?.caption) {
    ctx.reply('Фото отримано!');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caption: string = message?.caption;
    const containsMentionOrCommand =
      caption?.includes('@ringfit_together_bot') ||
      caption?.includes('/ringfit');
    const bestResolutionPhoto = message?.photo?.slice(-1)[0];

    if (!containsMentionOrCommand || !bestResolutionPhoto) return;

    const userId = message?.from?.id.toString();
    const chatId = message?.chat?.id.toString();
    const replyMessageId = message?.message_id;
    const username = getUsername(message?.from, userId);

    const photoLink = await bot.telegram.getFileLink(
      bestResolutionPhoto.file_id
    );

    // Get photo base64
    const photoBase64 = await getImage(photoLink.href);
    console.log('ctx.message', ctx.message);

    try {
      // Get text reko
      const trainingData = await getTrainingData(photoBase64);

      const entry = new UserEntry({
        userId,
        chatId,
        username,
        ...trainingData,
      });

      const res = await entry.save();
      console.log('Entry saved successfully:', res);
      ctx.reply(
        `Тренування додано! \n ${entry.hours}г ${entry.minutes}хв ${
          entry.seconds
        }с, ${entry.kcal} ккал, ${entry.distance.toFixed(2)} км`,
        { reply_to_message_id: replyMessageId }
      );
    } catch (err) {
      console.log('Error saving entry:', err);
      ctx.reply('Error saving entry:', err.message);
    }
  }
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running...');

  const _config = new AWS.Config({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
});
