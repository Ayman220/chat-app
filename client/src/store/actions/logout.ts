import { AppDispatch } from '../index';
import { clearAllState } from '../slices/authSlice';
import { resetChatState } from '../slices/chatSlice';
import { resetMessageState } from '../slices/messageSlice';
import { resetUIState } from '../slices/uiSlice';

export const performLogout = () => (dispatch: AppDispatch) => {
    // Clear all Redux state
    dispatch(clearAllState());
    dispatch(resetChatState());
    dispatch(resetMessageState());
    dispatch(resetUIState());
};
