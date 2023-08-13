import { User } from 'typegram';

export const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const remainingSeconds = seconds - hours * 3600 - minutes * 60;

  return `${hours}г ${minutes}хв ${remainingSeconds.toFixed(0)}с`;
};

export const getUsername = (ctxMessageFrom: User, userId: string) => {
  return (
    ctxMessageFrom?.username ||
    ctxMessageFrom?.first_name ||
    ctxMessageFrom?.last_name ||
    `Unknown user ${userId}`
  );
};
