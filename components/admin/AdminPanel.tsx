import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Room, RoomBlockConfig, Facility } from '../../types';
import { Edit2, Trash2, Plus, Users, Monitor, Search, ShieldOff, ShieldBan, Clock, Building2, Wrench, Mail, Save, X, Lock, UserCheck } from 'lucide-react';
import { BlockEmailPicker } from './BlockEmailPicker';
import { ConfirmModal } from '../common/ConfirmModal';
import { format, addHours } from 'date-fns';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';

type AdminTab = 'rooms' | 'blocks' | 'facilities';

export const AdminPanel: React.FC = () => {
  const { rooms, addRoom, updateRoom, deleteRoom, blockedSlots, addBlockedSlot, removeBlockedSlot, roomBlocks, addBlock, updateBlock, deleteBlock, facilityList, addFacility, updateFacility, deleteFacility, currentUser, managedUsers } = useApp();
  const [activeTab, setActiveTab] = useState<AdminTab>('rooms');
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [search, setSearch] = useState('');

  // New room form
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', block: '', type: 'Conference' as string, capacity: 10, facilities: [] as string[], notifyEmail: '', restricted: false, allowedUserIds: [] as string[] });
  const [newRoomUserSearch, setNewRoomUserSearch] = useState('');
  const [editRoomUserSearch, setEditRoomUserSearch] = useState('');

  // Block slot form
  const [blockRoomId, setBlockRoomId] = useState('');
  const [blockDate, setBlockDate] = useState('');
  const [blockStartHour, setBlockStartHour] = useState(9);
  const [blockDuration, setBlockDuration] = useState(1);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);

  // Block management state
  const [editingBlock, setEditingBlock] = useState<RoomBlockConfig | null>(null);
  const [newBlock, setNewBlock] = useState({ name: '', code: '', itEmail: '', receptionEmail: '', adminEmail: '' });
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<RoomBlockConfig | null>(null);

  // Facility management state
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [deleteFacilityTarget, setDeleteFacilityTarget] = useState<Facility | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.block.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  }, [rooms, search]);

  const activeBlocks = roomBlocks.filter(b => b.active);
  const activeFacilities = facilityList.filter(f => f.active);

  const handleSaveRoom = () => {
    if (!editingRoom) return;
    updateRoom(editingRoom);
    setEditingRoom(null);
  };

  const toggleEditRoomFacility = (facility: string) => {
    if (!editingRoom) return;
    setEditingRoom({
      ...editingRoom,
      facilities: editingRoom.facilities.includes(facility)
        ? editingRoom.facilities.filter(f => f !== facility)
        : [...editingRoom.facilities, facility]
    });
  };

  const handleAddRoom = () => {
    if (!newRoom.name.trim() || !newRoom.block) return;
    addRoom({ name: newRoom.name.trim(), block: newRoom.block, type: newRoom.type as any, capacity: newRoom.capacity, facilities: newRoom.facilities, notifyEmail: newRoom.notifyEmail.trim(), imageUrl: `https://picsum.photos/400/300?random=${Date.now()}`, restricted: newRoom.restricted, allowedUserIds: newRoom.restricted ? newRoom.allowedUserIds : [] });
    setNewRoom({ name: '', block: activeBlocks[0]?.name || '', type: 'Conference', capacity: 10, facilities: [], notifyEmail: '', restricted: false, allowedUserIds: [] });
    setNewRoomUserSearch('');
    setShowAddRoom(false);
  };

  const toggleNewRoomFacility = (facility: string) => {
    setNewRoom(prev => ({
      ...prev,
      facilities: prev.facilities.includes(facility)
        ? prev.facilities.filter(f => f !== facility)
        : [...prev.facilities, facility]
    }));
  };

  const handleBlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockRoomId || !blockDate || !blockReason.trim()) return;
    const start = new Date(`${blockDate}T${String(blockStartHour).padStart(2, '0')}:00:00`);
    const end = addHours(start, blockDuration);
    addBlockedSlot({ roomId: blockRoomId, startTime: start, endTime: end, reason: blockReason.trim(), blockedBy: currentUser.name });
    setBlockRoomId('');
    setBlockDate('');
    setBlockReason('');
    setShowBlockForm(false);
  };

  // Block config handlers
  const handleAddBlock = () => {
    if (!newBlock.name.trim() || !newBlock.code.trim()) return;
    addBlock({ ...newBlock, active: true });
    setNewBlock({ name: '', code: '', itEmail: '', receptionEmail: '', adminEmail: '' });
    setShowAddBlock(false);
  };

  const handleSaveBlock = () => {
    if (!editingBlock) return;
    updateBlock(editingBlock);
    setEditingBlock(null);
  };

  // Facility handlers
  const handleAddFacility = () => {
    if (!newFacilityName.trim()) return;
    addFacility({ name: newFacilityName.trim(), active: true });
    setNewFacilityName('');
  };

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'rooms', label: 'Rooms', icon: <Monitor size={16} /> },
    { key: 'blocks', label: 'Blocks', icon: <Building2 size={16} /> },
    { key: 'facilities', label: 'Facilities', icon: <Wrench size={16} /> },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Rooms Tab ── */}
      {activeTab === 'rooms' && (<>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">Room Management</h1>
          </div>
          <p className="text-slate-500">Manage conference rooms and blocked slots.</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowBlockForm(!showBlockForm)}
            icon={<ShieldBan size={18} />}
          >
            {showBlockForm ? 'Hide Block Form' : 'Block Room'}
          </Button>
          <Button
            onClick={() => { setShowAddRoom(!showAddRoom); if (!newRoom.block && activeBlocks.length) setNewRoom(r => ({ ...r, block: activeBlocks[0].name })); }}
            icon={<Plus size={20} />}
          >
            Add Room
          </Button>
        </div>
      </div>

      {/* Add Room Form */}
      {showAddRoom && (
        <Card className="mb-6 border-indigo-200 bg-indigo-50">
          <CardBody>
            <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2"><Monitor size={18} /> New Room</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Input label="Room Name *" value={newRoom.name} onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} placeholder="e.g. Narmada" />
              <Select label="Block *" value={newRoom.block} onChange={e => setNewRoom({ ...newRoom, block: e.target.value })} options={[{ value: '', label: 'Select block' }, ...activeBlocks.map(b => ({ value: b.name, label: b.name }))]} />
              <Select label="Type" value={newRoom.type} onChange={e => setNewRoom({ ...newRoom, type: e.target.value })} options={[{ value: 'Conference', label: 'Conference' }, { value: 'Board Room', label: 'Board Room' }]} />
              <Input label="Capacity" type="number" min={1} value={newRoom.capacity} onChange={e => setNewRoom({ ...newRoom, capacity: Number(e.target.value) })} />
            </div>
            <div className="mb-4">
              <Input label="Extra Notify Email (optional)" type="email" placeholder="e.g. manager@company.com" value={newRoom.notifyEmail} onChange={e => setNewRoom({ ...newRoom, notifyEmail: e.target.value })} icon={<Mail size={16} />} />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-indigo-800 mb-2">Facilities</label>
              <div className="flex flex-wrap gap-2">
                {activeFacilities.map(f => (
                  <label key={f.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                    newRoom.facilities.includes(f.name)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-indigo-300 hover:border-indigo-400'
                  }`}>
                    <input type="checkbox" checked={newRoom.facilities.includes(f.name)} onChange={() => toggleNewRoomFacility(f.name)} className="sr-only" />
                    {f.name}
                  </label>
                ))}
              </div>
            </div>
            {/* Room restriction */}
            <div className="mb-4 border border-indigo-200 rounded-xl p-4 bg-white space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" checked={newRoom.restricted} onChange={e => setNewRoom(prev => ({ ...prev, restricted: e.target.checked, allowedUserIds: e.target.checked ? prev.allowedUserIds : [] }))} />
                  <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <div className="flex items-center gap-2">
                  <Lock size={14} className={newRoom.restricted ? 'text-indigo-600' : 'text-slate-400'} />
                  <span className="text-sm font-medium text-slate-700">Restrict to specific users</span>
                </div>
              </label>
              {newRoom.restricted && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Admin, Reception & IT always bypass this restriction.</p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" placeholder="Search users..." value={newRoomUserSearch} onChange={e => setNewRoomUserSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                    {managedUsers.filter(u => u.active && (u.name.toLowerCase().includes(newRoomUserSearch.toLowerCase()) || u.domainId?.toLowerCase().includes(newRoomUserSearch.toLowerCase()))).map(u => (
                      <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${newRoom.allowedUserIds.includes(u.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={newRoom.allowedUserIds.includes(u.id)} onChange={() => setNewRoom(prev => ({ ...prev, allowedUserIds: prev.allowedUserIds.includes(u.id) ? prev.allowedUserIds.filter(id => id !== u.id) : [...prev.allowedUserIds, u.id] }))} className="rounded text-indigo-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                          <p className="text-xs text-slate-400 truncate">{u.domainId}</p>
                        </div>
                        {newRoom.allowedUserIds.includes(u.id) && <UserCheck size={14} className="text-indigo-500 flex-shrink-0" />}
                      </label>
                    ))}
                  </div>
                  {newRoom.allowedUserIds.length > 0 && <p className="text-xs text-indigo-600 font-medium">{newRoom.allowedUserIds.length} user{newRoom.allowedUserIds.length !== 1 ? 's' : ''} allowed</p>}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddRoom}>Create Room</Button>
              <Button variant="ghost" onClick={() => setShowAddRoom(false)}>Cancel</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Block Room Form */}
      {showBlockForm && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardBody>
            <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2"><ShieldBan size={18} /> Block Room Time Slot</h3>
            <form onSubmit={handleBlockSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <Select label="Room" value={blockRoomId} onChange={e => setBlockRoomId(e.target.value)} required options={[{ value: '', label: 'Select room' }, ...rooms.map(r => ({ value: r.id, label: r.name }))]} />
              <Input label="Date" type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} required />
              <Select label="Start Hour" value={blockStartHour} onChange={e => setBlockStartHour(Number(e.target.value))} options={Array.from({ length: 10 }, (_, i) => i + 8).map(h => ({ value: h.toString(), label: `${h}:00` }))} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Duration & Reason</label>
                <div className="flex gap-2">
                  <select value={blockDuration} onChange={e => setBlockDuration(Number(e.target.value))} className="w-20 px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors">
                    {[1, 2, 3, 4].map(d => <option key={d} value={d}>{d}h</option>)}
                  </select>
                  <input type="text" placeholder="Reason" value={blockReason} onChange={e => setBlockReason(e.target.value)} required className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700">Block Slot</Button>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Active Blocked Slots */}
      {blockedSlots.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Active Blocked Slots</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blockedSlots.map(bs => {
              const room = rooms.find(r => r.id === bs.roomId);
              return (
                <div key={bs.id} className="bg-red-50 border border-red-200 rounded-lg p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-red-800">{room?.name}</p>
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <Clock size={12} /> {format(bs.startTime, 'MMM d, h:mm a')} - {format(bs.endTime, 'h:mm a')}
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">{bs.reason}</p>
                  </div>
                  <button onClick={() => removeBlockedSlot(bs.id)} className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-100 rounded transition-colors" title="Remove block">
                    <ShieldOff size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Room Search */}
      <div className="mb-6 max-w-md">
        <Input
          icon={<Search size={16} />}
          placeholder="Search rooms..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Room List */}
      <div className="space-y-4">
        {filtered.map(room => (
          <Card key={room.id}>
            <CardBody>
              {editingRoom?.id === room.id ? (
                /* Editing mode */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <Input label="Room Name" value={editingRoom.name} onChange={e => setEditingRoom({ ...editingRoom, name: e.target.value })} />
                    <Select label="Block" value={editingRoom.block} onChange={e => setEditingRoom({ ...editingRoom, block: e.target.value })} options={activeBlocks.map(b => ({ value: b.name, label: b.name }))} />
                    <Select label="Type" value={editingRoom.type} onChange={e => setEditingRoom({ ...editingRoom, type: e.target.value as any })} options={[{ value: 'Conference', label: 'Conference' }, { value: 'Board Room', label: 'Board Room' }]} />
                    <Input label="Capacity" type="number" min={1} value={editingRoom.capacity} onChange={e => setEditingRoom({ ...editingRoom, capacity: Number(e.target.value) })} />
                  </div>
                  <div className="mb-4">
                    <Input label="Extra Notify Email (optional)" type="email" placeholder="e.g. manager@company.com" value={editingRoom.notifyEmail || ''} onChange={e => setEditingRoom({ ...editingRoom, notifyEmail: e.target.value })} icon={<Mail size={16} />} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Facilities</label>
                    <div className="flex flex-wrap gap-2">
                      {activeFacilities.map(f => (
                        <label key={f.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                          editingRoom.facilities.includes(f.name)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                        }`}>
                          <input type="checkbox" checked={editingRoom.facilities.includes(f.name)} onChange={() => toggleEditRoomFacility(f.name)} className="sr-only" />
                          {f.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Room restriction */}
                  <div className="mb-4 border border-slate-200 rounded-xl p-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" className="sr-only peer" checked={editingRoom.restricted || false} onChange={e => { setEditingRoom({ ...editingRoom, restricted: e.target.checked, allowedUserIds: e.target.checked ? (editingRoom.allowedUserIds || []) : [] }); setEditRoomUserSearch(''); }} />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors" />
                        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Lock size={14} className={editingRoom.restricted ? 'text-indigo-600' : 'text-slate-400'} />
                        <span className="text-sm font-medium text-slate-700">Restrict to specific users</span>
                      </div>
                    </label>
                    {editingRoom.restricted && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">Admin, Reception & IT always bypass this restriction.</p>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input type="text" placeholder="Search users..." value={editRoomUserSearch} onChange={e => setEditRoomUserSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                          {managedUsers.filter(u => u.active && (u.name.toLowerCase().includes(editRoomUserSearch.toLowerCase()) || u.domainId?.toLowerCase().includes(editRoomUserSearch.toLowerCase()))).map(u => {
                            const allowed = (editingRoom.allowedUserIds || []).includes(u.id);
                            return (
                              <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${allowed ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                <input type="checkbox" checked={allowed} onChange={() => setEditingRoom(prev => prev ? { ...prev, allowedUserIds: allowed ? (prev.allowedUserIds || []).filter(id => id !== u.id) : [...(prev.allowedUserIds || []), u.id] } : prev)} className="rounded text-indigo-600" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                                  <p className="text-xs text-slate-400 truncate">{u.domainId}</p>
                                </div>
                                {allowed && <UserCheck size={14} className="text-indigo-500 flex-shrink-0" />}
                              </label>
                            );
                          })}
                        </div>
                        {(editingRoom.allowedUserIds || []).length > 0 && <p className="text-xs text-indigo-600 font-medium">{editingRoom.allowedUserIds!.length} user{editingRoom.allowedUserIds!.length !== 1 ? 's' : ''} allowed</p>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveRoom} icon={<Save size={14} />}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditingRoom(null)} icon={<X size={14} />}>Cancel</Button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg text-slate-900">{room.name}</h3>
                      <Badge variant="neutral">{room.block}</Badge>
                      <Badge variant={room.type === 'Board Room' ? 'info' : 'success'}>
                        {room.type === 'Board Room' ? 'Board' : 'Conf'}
                      </Badge>
                      {room.restricted && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                          <Lock size={11} /> Restricted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-sm text-slate-600"><Users size={14} /> {room.capacity} Seats</span>
                      <div className="flex flex-wrap gap-1">
                        {room.facilities.map(f => (
                          <Badge key={f} variant="neutral">{f}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingRoom({ ...room })} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => setDeleteTarget(room)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <Monitor size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No rooms match your search.</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteRoom(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete Room"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All associated bookings will be orphaned.`}
        confirmLabel="Delete Room"
        confirmVariant="danger"
      />
      </>)}

      {/* ── Blocks Tab ── */}
      {activeTab === 'blocks' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
                <h1 className="text-2xl font-bold text-slate-900">Block Management</h1>
              </div>
              <p className="text-slate-500">Configure building blocks and their IT / Reception / Admin email contacts.</p>
            </div>
            <Button onClick={() => setShowAddBlock(!showAddBlock)} icon={<Plus size={20} />}>
              Add Block
            </Button>
          </div>

          {/* Add Block Form */}
          {showAddBlock && (
            <Card className="mb-6 border-indigo-200 bg-indigo-50">
              <CardBody>
                <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2"><Building2 size={18} /> New Block</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <Input label="Block Name *" value={newBlock.name} onChange={e => setNewBlock({ ...newBlock, name: e.target.value })} placeholder="e.g. Block A" />
                  <Input label="Code *" value={newBlock.code} onChange={e => setNewBlock({ ...newBlock, code: e.target.value })} placeholder="e.g. A" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <BlockEmailPicker label="IT Email(s)" value={newBlock.itEmail} onChange={v => setNewBlock({ ...newBlock, itEmail: v })} colorClass="text-blue-500" />
                  <BlockEmailPicker label="Reception Email(s)" value={newBlock.receptionEmail} onChange={v => setNewBlock({ ...newBlock, receptionEmail: v })} colorClass="text-teal-500" />
                  <BlockEmailPicker label="Admin Email(s)" value={newBlock.adminEmail} onChange={v => setNewBlock({ ...newBlock, adminEmail: v })} colorClass="text-purple-500" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddBlock}>Create Block</Button>
                  <Button variant="ghost" onClick={() => setShowAddBlock(false)}>Cancel</Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Block List */}
          <div className="space-y-4">
            {roomBlocks.map(block => (
              <Card key={block.id}>
                <CardBody>
                  {editingBlock?.id === block.id ? (
                    /* Editing mode */
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <Input label="Block Name" value={editingBlock.name} onChange={e => setEditingBlock({ ...editingBlock, name: e.target.value })} />
                        <Input label="Code" value={editingBlock.code} onChange={e => setEditingBlock({ ...editingBlock, code: e.target.value })} />
                        <div className="flex items-end pb-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editingBlock.active} onChange={e => setEditingBlock({ ...editingBlock, active: e.target.checked })} className="rounded text-indigo-600" />
                            <span className="text-sm text-slate-700">Active</span>
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <BlockEmailPicker label="IT Email(s)" value={editingBlock.itEmail || ''} onChange={v => setEditingBlock({ ...editingBlock, itEmail: v })} colorClass="text-blue-500" />
                        <BlockEmailPicker label="Reception Email(s)" value={editingBlock.receptionEmail || ''} onChange={v => setEditingBlock({ ...editingBlock, receptionEmail: v })} colorClass="text-teal-500" />
                        <BlockEmailPicker label="Admin Email(s)" value={editingBlock.adminEmail || ''} onChange={v => setEditingBlock({ ...editingBlock, adminEmail: v })} colorClass="text-purple-500" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveBlock} icon={<Save size={14} />}>Save</Button>
                        <Button variant="ghost" onClick={() => setEditingBlock(null)} icon={<X size={14} />}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-lg text-slate-900">{block.name}</h3>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{block.code}</span>
                          <Badge variant={block.active ? 'success' : 'danger'}>
                            {block.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail size={14} className="text-blue-500" />
                            <span className="font-medium">IT:</span> {block.itEmail || <span className="text-slate-400 italic">Not set</span>}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail size={14} className="text-teal-500" />
                            <span className="font-medium">Reception:</span> {block.receptionEmail || <span className="text-slate-400 italic">Not set</span>}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail size={14} className="text-purple-500" />
                            <span className="font-medium">Admin:</span> {block.adminEmail || <span className="text-slate-400 italic">Not set</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingBlock({ ...block })} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => setDeleteBlockTarget(block)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
            {roomBlocks.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <Building2 size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No blocks configured. Add a block to get started.</p>
              </div>
            )}
          </div>

          <ConfirmModal
            isOpen={!!deleteBlockTarget}
            onClose={() => setDeleteBlockTarget(null)}
            onConfirm={() => {
              if (deleteBlockTarget) deleteBlock(deleteBlockTarget.id);
              setDeleteBlockTarget(null);
            }}
            title="Delete Block"
            message={`Are you sure you want to delete "${deleteBlockTarget?.name}"? Rooms assigned to this block will need to be reassigned.`}
            confirmLabel="Delete Block"
            confirmVariant="danger"
          />
        </div>
      )}

      {/* ── Facilities Tab ── */}
      {activeTab === 'facilities' && (
        <div>
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
              <h1 className="text-2xl font-bold text-slate-900">Facility Management</h1>
            </div>
            <p className="text-slate-500">Manage available room facilities and amenities.</p>
          </div>

          {/* Add Facility */}
          <Card className="mb-6">
            <CardBody>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Input
                    label="Add New Facility"
                    value={newFacilityName}
                    onChange={e => setNewFacilityName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddFacility()}
                    placeholder="e.g. Projector, Whiteboard..."
                  />
                </div>
                <Button onClick={handleAddFacility} icon={<Plus size={16} />}>Add</Button>
              </div>
            </CardBody>
          </Card>

          {/* Facility List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {facilityList.map(facility => (
              <Card key={facility.id}>
                <CardBody className="p-4 flex justify-between items-center">
                  {editingFacility?.id === facility.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingFacility.name}
                        onChange={e => setEditingFacility({ ...editingFacility, name: e.target.value })}
                        className="flex-1"
                      />
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={editingFacility.active} onChange={e => setEditingFacility({ ...editingFacility, active: e.target.checked })} className="rounded text-indigo-600" />
                        Active
                      </label>
                      <button onClick={() => { updateFacility(editingFacility); setEditingFacility(null); }} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save size={14} /></button>
                      <button onClick={() => setEditingFacility(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Wrench size={14} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-800">{facility.name}</span>
                        <Badge variant={facility.active ? 'success' : 'danger'}>
                          {facility.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingFacility({ ...facility })} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteFacilityTarget(facility)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
          {facilityList.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 mt-4">
              <Wrench size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500">No facilities configured. Add a facility to get started.</p>
            </div>
          )}

          <ConfirmModal
            isOpen={!!deleteFacilityTarget}
            onClose={() => setDeleteFacilityTarget(null)}
            onConfirm={() => {
              if (deleteFacilityTarget) deleteFacility(deleteFacilityTarget.id);
              setDeleteFacilityTarget(null);
            }}
            title="Delete Facility"
            message={`Are you sure you want to delete "${deleteFacilityTarget?.name}"?`}
            confirmLabel="Delete Facility"
            confirmVariant="danger"
          />
        </div>
      )}
    </div>
  );
};
