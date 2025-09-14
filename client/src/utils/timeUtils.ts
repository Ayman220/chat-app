export const formatLastSeen = (lastSeen: string, currentTime?: number): string => {
    const now = currentTime ? new Date(currentTime) : new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffInMs = now.getTime() - lastSeenDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) {
        return 'just now';
    } else if (diffInMinutes < 60) {
        return `${diffInMinutes} min${diffInMinutes === 1 ? '' : 's'} ago`;
    } else if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    } else if (diffInDays < 7) {
        return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
    } else {
        // For more than a week, show the actual date
        return lastSeenDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: lastSeenDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
};
