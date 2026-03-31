// Toast notification hook
import { useState, useCallback } from 'react';

export function useToast() {
    const [toast, setToast] = useState({ visible: false, message: '', icon: '✅' });

    const showToast = useCallback((message, icon = '✅') => {
        setToast({ visible: true, message, icon });
        setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000);
    }, []);

    return { toast, showToast };
}
