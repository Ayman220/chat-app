import { resetDatabase } from './database/setup';

async function main() {
  try {
    console.log('Resetting database...');
    await resetDatabase();
    console.log('Database reset successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

main(); 