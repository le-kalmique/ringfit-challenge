import mongoose from 'mongoose';
import { Telegraf, Context } from 'telegraf';
import { UserEntry } from './models/Entry.js';
import { formatTime, getUsername } from './utils.js';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

interface UserEntry {
  hours: number;
  minutes: number;
  seconds: number;
  kcal: number;
  distance: number;
}

mongoose.connect(
  `mongodb+srv://bot:${process.env.MONGO_PASSWORD}@main.us253pi.mongodb.net/`,
  {}
);

const db = mongoose.connection;
const bot = new Telegraf(process.env.BOT_TOKEN);

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running...');
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

      try {
        const res = await entry.save();
        console.log('Entry saved successfully:', res);
        ctx.reply(
          `Тренування додано! \n ${parsedHours}г ${parsedMinutes}хв ${parsedSeconds}с, ${entry.kcal} ккал, ${entry.distance} км`,
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
💪 Всього калорій: ${totalKcal}
      Середня кількість калорій: ${avgKcal}
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

bot.command('ratings', async (ctx: Context) => {
  try {
    const chatId = ctx.message?.chat?.id.toString(); // Get chat ID

    const withMedal = (rating: number) =>
      rating === 0 ? '🥇' : rating === 1 ? '🥈' : rating === 2 ? '🥉' : '';

    // RATINGS BY TOTAL TRAININGS
    const ratings = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
      {
        $group: {
          _id: '$userId',
          totalTrainings: { $sum: 1 },
          username: { $first: '$username' },
        },
      },
      { $sort: { totalTrainings: -1 } },
    ]).exec();

    const ratingText = ratings.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username} - ${
          rating.totalTrainings
        }\n`
    );

    const ratingMessage = '🏆 КІЛЬКІСТЬ ТРЕНУВАНЬ\n\n' + ratingText.join('\n');

    // RATINGS BY AVG TIME
    const ratingsByTime = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
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
    ]).exec();

    console.log('ratingsByTime', ratingsByTime);

    const ratingByTimeText = ratingsByTime.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${rating.username} - ${formatTime(
          rating.avgTime
        )}\n`
    );

    const ratingByTimeMessage =
      '⏳ СЕРЕДНІЙ ЧАС\n\n' + ratingByTimeText.join('\n');

    // RATINGS BY AVG KCAL
    const ratingsByKcal = await UserEntry.aggregate([
      { $match: { chatId: chatId } }, // Consider entries from the same chat
      {
        $group: {
          _id: '$userId',
          avgKcal: { $avg: '$kcal' },
          username: { $first: '$username' },
        },
      },
      { $sort: { avgKcal: -1 } },
    ]).exec();

    const ratingByKcalText = ratingsByKcal.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${
          rating.username
        } - ${rating.avgKcal.toFixed(2)}\n`
    );

    const ratingsByKcalMessage =
      '💪 СЕРЕДНЯ КІЛЬКІСТЬ КАЛОРІЙ\n\n' + ratingByKcalText.join('\n');

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
    ]).exec();

    const ratingByDistanceText = ratingsByDistance.map(
      (rating, index) =>
        `${withMedal(index)} ${index + 1}. ${
          rating.username
        } - ${rating.totalDistance.toFixed(2)} км\n`
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
