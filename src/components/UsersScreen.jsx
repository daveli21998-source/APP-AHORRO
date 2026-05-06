import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Users, User, RefreshCw, ArrowRightLeft } from 'lucide-react';
import './UsersScreen.css';

const UsersScreen = () => {
    const { fetchAllProfiles, updateProfileRole, isAdmin, profile: myProfile } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await fetchAllProfiles();
            setUsers(data);
        } catch (err) {
            console.error('Error loading users:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleToggleRole = async (userId, currentRole) => {
        if (!isAdmin) return;
        setUpdatingId(userId);
        try {
            const newRole = currentRole === 'admin' ? 'cobrador' : 'admin';
            await updateProfileRole(userId, newRole);
            await loadUsers();
        } catch (err) {
            alert('No se pudo cambiar el rol');
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <div className="users-container">
            <div className="users-header">
                <h2><Users size={24} /> Equipo</h2>
                <button className="btn-refresh-users" onClick={loadUsers} disabled={loading}>
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="user-list">
                {users.map(user => (
                    <div key={user.id} className="user-row">
                        <div className="user-main-info">
                            <div className={`user-avatar-mini ${user.role}`}>
                                {user.nombre ? user.nombre[0].toUpperCase() : <User size={18} />}
                            </div>
                            <div className="user-details">
                                <span className="user-email">
                                    {user.nombre} {user.id === myProfile?.id && '(Tú)'}
                                </span>
                                <span className={`user-role-label ${user.role}`}>
                                    {user.role === 'admin' ? '🛡️ Administrador' : '💼 Cobrador'}
                                </span>
                            </div>
                        </div>

                        {isAdmin && user.id !== myProfile?.id && (
                            <button 
                                className="btn-toggle-role"
                                onClick={() => handleToggleRole(user.id, user.role)}
                                disabled={updatingId === user.id}
                            >
                                {updatingId === user.id ? (
                                    <RefreshCw size={18} className="animate-spin" />
                                ) : (
                                    <ArrowRightLeft size={18} />
                                )}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default UsersScreen;
