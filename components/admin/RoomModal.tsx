import React, { useState, useEffect } from 'react';
import { Room, RoomType } from '../../types';
import { useApp } from '../../context/AppContext';
import { X, Lock, Search, UserCheck } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (room: Omit<Room, 'id'> | Room) => void;
  initialData?: Room;
}

export const RoomModal: React.FC<RoomModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const { roomBlocks, facilityList, managedUsers } = useApp();
  const activeBlocks = roomBlocks.filter(b => b.active);
  const activeFacilities = facilityList.filter(f => f.active);

  const [formData, setFormData] = useState<Partial<Room>>({
    name: '',
    block: activeBlocks[0]?.name || '',
    type: RoomType.CONFERENCE,
    capacity: 10,
    facilities: [],
    notifyEmail: '',
    restricted: false,
    allowedUserIds: [],
  });

  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = managedUsers.filter(u =>
    u.active &&
    (u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.domainId?.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.email?.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const toggleAllowedUser = (userId: string) => {
    setFormData(prev => {
      const current = prev.allowedUserIds || [];
      return {
        ...prev,
        allowedUserIds: current.includes(userId)
          ? current.filter(id => id !== userId)
          : [...current, userId],
      };
    });
  };

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        name: '',
        block: activeBlocks[0]?.name || '',
        type: RoomType.CONFERENCE,
        capacity: 10,
        facilities: [],
        notifyEmail: '',
        restricted: false,
        allowedUserIds: [],
      });
    }
    setUserSearch('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.capacity) {
        onSave(formData as Room);
        onClose();
    }
  };

  const toggleFacility = (facility: string) => {
    setFormData(prev => {
      const facilities = prev.facilities || [];
      if (facilities.includes(facility)) {
        return { ...prev, facilities: facilities.filter(f => f !== facility) };
      }
      return { ...prev, facilities: [...facilities, facility] };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold">{initialData ? 'Edit Room' : 'Add New Room'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <Input 
            label="Room Name"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Block"
              value={formData.block}
              onChange={e => setFormData({ ...formData, block: e.target.value })}
              options={activeBlocks.map(b => ({ value: b.name, label: b.name }))}
            />
            <Select 
              label="Type"
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value as RoomType })}
              options={Object.values(RoomType).map(t => ({ value: t, label: t }))}
            />
          </div>

          <Input 
            label="Capacity"
            type="number" 
            required
            min={1}
            value={formData.capacity}
            onChange={e => setFormData({ ...formData, capacity: Number(e.target.value) })}
          />

          <Input
            label="Extra Notify Email (optional)"
            type="email"
            placeholder="e.g. manager@company.com"
            value={formData.notifyEmail || ''}
            onChange={e => setFormData({ ...formData, notifyEmail: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Facilities</label>
            <div className="grid grid-cols-2 gap-2">
              {activeFacilities.map(f => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.facilities?.includes(f.name)}
                    onChange={() => toggleFacility(f.name)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-600">{f.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Room Access Restriction */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.restricted || false}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    restricted: e.target.checked,
                    allowedUserIds: e.target.checked ? prev.allowedUserIds : [],
                  }))}
                />
                <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <div className="flex items-center gap-2">
                <Lock size={14} className={formData.restricted ? 'text-indigo-600' : 'text-slate-400'} />
                <span className="text-sm font-medium text-slate-700">Restrict to specific users</span>
              </div>
            </label>

            {formData.restricted && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Only selected users (plus Admin, Reception, IT roles) can book this room.
                </p>

                {/* User search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Allowed users list */}
                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">No users found</p>
                  )}
                  {filteredUsers.map(u => {
                    const checked = (formData.allowedUserIds || []).includes(u.id);
                    return (
                      <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowedUser(u.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.domainId}</p>
                        </div>
                        {checked && <UserCheck size={14} className="text-indigo-500 flex-shrink-0 ml-auto" />}
                      </label>
                    );
                  })}
                </div>

                {(formData.allowedUserIds || []).length > 0 && (
                  <p className="text-xs text-indigo-600 font-medium">
                    {formData.allowedUserIds!.length} user{formData.allowedUserIds!.length !== 1 ? 's' : ''} allowed
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Room</Button>
          </div>
        </form>
      </div>
    </div>
  );
};
