import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { ManagedUser, UserRole } from '../../types';
import { Users, Plus, Pencil, Trash2, Search, X, UserCheck, UserX, Save, Mail, Building2, Network, Award, ChevronLeft, ChevronRight, KeyRound, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';
import { usersApi } from '../../services/api';

export const UserManagement: React.FC = () => {
  const { managedUsers, companies, departments, designations, addManagedUser, updateManagedUser, deleteManagedUser, refreshData } = useApp();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  
  const [showAddUser, setShowAddUser] = useState(false);
  const emptyForm: Omit<ManagedUser, 'id'> = { name: '', domainId: '', email: '', role: UserRole.EMPLOYEE, companyId: '', departmentId: '', designationId: '', active: true };
  const [newUser, setNewUser] = useState<Omit<ManagedUser, 'id'>>(emptyForm);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<ManagedUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [syncLdapLoading, setSyncLdapLoading] = useState(false);
  const [syncLdapError, setSyncLdapError] = useState('');
  const [syncLdapSuccess, setSyncLdapSuccess] = useState('');
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{ synced: number; failed: number; skipped: number; errors: string[] } | null>(null);

  const filtered = useMemo(() => {
    return managedUsers.filter(u => {
      const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.domainId.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [managedUsers, search, roleFilter]);

  // Reset to page 1 when filters change
  React.useEffect(() => { setPage(1); }, [search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const newCompanyDepts = useMemo(() => departments.filter(d => newUser.companyId && d.companyIds.includes(newUser.companyId) && d.active), [departments, newUser.companyId]);
  const editCompanyDepts = useMemo(() => departments.filter(d => editingUser?.companyId && d.companyIds.includes(editingUser.companyId) && d.active), [departments, editingUser?.companyId]);
  const newCompanyDesigs = useMemo(() => designations.filter(d => newUser.companyId && d.companyIds.includes(newUser.companyId) && d.active), [designations, newUser.companyId]);
  const editCompanyDesigs = useMemo(() => designations.filter(d => editingUser?.companyId && d.companyIds.includes(editingUser.companyId) && d.active), [designations, editingUser?.companyId]);

  const handleAddUser = () => {
    if (!newUser.name || !newUser.domainId || !newUser.email) return;
    addManagedUser(newUser);
    setNewUser(emptyForm);
    setShowAddUser(false);
  };

  const handleSyncAllFromLdap = async () => {
    setSyncAllLoading(true);
    setSyncAllResult(null);
    try {
      const result = await usersApi.syncAllFromLdap();
      setSyncAllResult(result);
      // Refresh managed users list without triggering PUT for each user
      await refreshData();
    } catch (err: any) {
      setSyncAllResult({ synced: 0, failed: 1, skipped: 0, errors: [err?.message || 'Sync failed'] });
    } finally {
      setSyncAllLoading(false);
    }
  };

  const handleSyncFromLdap = async () => {
    if (!editingUser) return;
    setSyncLdapLoading(true);
    setSyncLdapError('');
    setSyncLdapSuccess('');
    try {
      const updated = await usersApi.syncFromLdap(editingUser.id);
      setEditingUser({ ...editingUser, name: updated.name, email: updated.email });
      setSyncLdapSuccess(`Synced: "${updated.name}" / ${updated.email}`);
    } catch (err: any) {
      setSyncLdapError(err?.message || 'Failed to sync from LDAP');
    } finally {
      setSyncLdapLoading(false);
    }
  };

  const handleSaveUser = () => {
    if (!editingUser || !editingUser.name || !editingUser.domainId || !editingUser.email) return;
    updateManagedUser(editingUser);
    setEditingUser(null);
  };

  const getCompanyName = (id: string | undefined) => companies.find(c => c.id === id)?.name || '—';
  const getDeptName = (id: string | undefined) => departments.find(d => d.id === id)?.name || '—';
  const getDesigName = (id: string | undefined) => designations.find(d => d.id === id)?.name || '—';

  const handleResetPassword = async () => {
    if (!resetPasswordTarget || !resetPasswordValue || resetPasswordValue.length < 8) {
      setResetPasswordError('Password must be at least 8 characters');
      return;
    }
    setResetPasswordLoading(true);
    setResetPasswordError('');
    try {
      await usersApi.resetPassword(resetPasswordTarget.id, resetPasswordValue);
      setResetPasswordTarget(null);
      setResetPasswordValue('');
    } catch (err: any) {
      setResetPasswordError(err?.message || 'Failed to reset password');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const roleBadge = (role: UserRole) => {
    const styles: Record<string, string> = {
      [UserRole.ADMIN]: 'bg-red-100 text-red-700',
      [UserRole.IT]: 'bg-amber-100 text-amber-700',
      [UserRole.RECEPTION]: 'bg-teal-100 text-teal-700',
      [UserRole.ADMINISTRATION]: 'bg-purple-100 text-purple-700',
      [UserRole.EMPLOYEE]: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[role] || 'bg-slate-100 text-slate-600'}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-indigo-500 rounded-full flex-shrink-0" />
            <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          </div>
          <p className="text-slate-500">{managedUsers.length} users total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={handleSyncAllFromLdap}
            disabled={syncAllLoading}
            icon={<RefreshCw size={16} className={syncAllLoading ? 'animate-spin' : ''} />}
          >
            {syncAllLoading ? 'Syncing…' : 'Sync All from LDAP'}
          </Button>
          <Button onClick={() => setShowAddUser(!showAddUser)} icon={<Plus size={16} />}>
            Add User
          </Button>
        </div>
      </div>
      {syncAllResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          syncAllResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          <span className="font-semibold">LDAP Sync complete:</span> {syncAllResult.synced} updated, {syncAllResult.skipped} unchanged, {syncAllResult.failed} failed.
          {syncAllResult.errors.length > 0 && (
            <ul className="mt-1 list-disc list-inside text-xs">
              {syncAllResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {syncAllResult.errors.length > 5 && <li>…and {syncAllResult.errors.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}

      {/* Add User Form */}
      {showAddUser && (
        <Card className="mb-6 border-indigo-200 bg-indigo-50">
          <CardBody>
            <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2"><Users size={18} /> New User</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <Input label="Full Name *" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="e.g. John Doe" />
              <Input label="Domain ID *" value={newUser.domainId} onChange={e => setNewUser({ ...newUser, domainId: e.target.value })} placeholder="e.g. jdoe" />
              <Input label="Email *" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="john@example.com" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <Select label="Role" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })} options={Object.values(UserRole).map(r => ({ value: r, label: r }))} />
              <Select label="Company" value={newUser.companyId} onChange={e => setNewUser({ ...newUser, companyId: e.target.value, departmentId: '', designationId: '' })} options={[{ value: '', label: '— Select —' }, ...companies.filter(c => c.active).map(c => ({ value: c.id, label: c.name }))]} />
              <Select label="Department" value={newUser.departmentId} onChange={e => setNewUser({ ...newUser, departmentId: e.target.value })} disabled={!newUser.companyId} options={[{ value: '', label: '— Select —' }, ...newCompanyDepts.map(d => ({ value: d.id, label: d.name }))]} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <Select label="Designation" value={newUser.designationId} onChange={e => setNewUser({ ...newUser, designationId: e.target.value })} disabled={!newUser.companyId} options={[{ value: '', label: '— Select —' }, ...newCompanyDesigs.map(d => ({ value: d.id, label: d.name }))]} />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newUser.active} onChange={e => setNewUser({ ...newUser, active: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500" />
                  <span className="text-sm font-semibold text-indigo-800">Active User</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddUser} disabled={!newUser.name || !newUser.domainId || !newUser.email}>Create User</Button>
              <Button variant="ghost" onClick={() => setShowAddUser(false)}>Cancel</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Input icon={<Search size={16} />} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, domain ID, or email…" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} options={[{ value: 'ALL', label: 'All Roles' }, ...Object.values(UserRole).map(r => ({ value: r, label: r }))]} />
        </div>
      </div>

      {/* User List */}
      <div className="space-y-4">
        {paged.map(user => (
          <Card key={user.id}>
            <CardBody>
              {editingUser?.id === user.id ? (
                /* Editing mode */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <Input label="Full Name *" value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                    <Input label="Domain ID *" value={editingUser.domainId} onChange={e => setEditingUser({ ...editingUser, domainId: e.target.value })} />
                    <Input label="Email *" type="email" value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <Select label="Role" value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value as UserRole })} options={Object.values(UserRole).map(r => ({ value: r, label: r }))} />
                    {!editingUser.isLocal && (
                      <>
                        <Select label="Company" value={editingUser.companyId} onChange={e => setEditingUser({ ...editingUser, companyId: e.target.value, departmentId: '', designationId: '' })} options={[{ value: '', label: '— Select —' }, ...companies.filter(c => c.active).map(c => ({ value: c.id, label: c.name }))]} />
                        <Select label="Department" value={editingUser.departmentId} onChange={e => setEditingUser({ ...editingUser, departmentId: e.target.value })} disabled={!editingUser.companyId} options={[{ value: '', label: '— Select —' }, ...editCompanyDepts.map(d => ({ value: d.id, label: d.name }))]} />
                      </>
                    )}
                  </div>
                  {!editingUser.isLocal && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      <Select label="Designation" value={editingUser.designationId} onChange={e => setEditingUser({ ...editingUser, designationId: e.target.value })} disabled={!editingUser.companyId} options={[{ value: '', label: '— Select —' }, ...editCompanyDesigs.map(d => ({ value: d.id, label: d.name }))]} />
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editingUser.active} onChange={e => setEditingUser({ ...editingUser, active: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                          <span className="text-sm font-semibold text-slate-700">Active User</span>
                        </label>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button onClick={handleSaveUser} disabled={!editingUser.name || !editingUser.domainId || !editingUser.email} icon={<Save size={14} />}>Save</Button>
                    {!editingUser.isLocal && (
                      <Button
                        variant="ghost"
                        onClick={handleSyncFromLdap}
                        disabled={syncLdapLoading}
                        icon={<RefreshCw size={14} className={syncLdapLoading ? 'animate-spin' : ''} />}
                      >
                        {syncLdapLoading ? 'Syncing…' : 'Sync from LDAP'}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => { setEditingUser(null); setSyncLdapError(''); setSyncLdapSuccess(''); }} icon={<X size={14} />}>Cancel</Button>
                    {syncLdapError && <span className="text-xs text-red-600 ml-2">{syncLdapError}</span>}
                    {syncLdapSuccess && <span className="text-xs text-green-600 ml-2">{syncLdapSuccess}</span>}
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg text-slate-900">{user.name}</h3>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">{user.domainId}</span>
                      {roleBadge(user.role)}
                      <Badge variant={user.active ? 'success' : 'danger'}>
                        {user.active ? <span className="flex items-center gap-1"><UserCheck size={12} /> Active</span> : <span className="flex items-center gap-1"><UserX size={12} /> Inactive</span>}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail size={14} className="text-blue-500" />
                        <span>{user.email}</span>
                      </div>
                      {!user.isLocal && (
                        <>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Building2 size={14} className="text-teal-500" />
                            <span>{getCompanyName(user.companyId)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Network size={14} className="text-purple-500" />
                            <span>{getDeptName(user.departmentId)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Award size={14} className="text-amber-500" />
                            <span>{getDesigName(user.designationId)}</span>
                          </div>
                        </>
                      )}
                      {user.isLocal && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 italic">
                          <KeyRound size={14} className="text-indigo-400" />
                          <span>Local Account</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingUser({ ...user }); setSyncLdapError(''); setSyncLdapSuccess(''); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Pencil size={16} /></button>
                    {user.isLocal && (
                      <button onClick={() => { setResetPasswordTarget(user); setResetPasswordValue(''); setResetPasswordError(''); }} title="Reset Password" className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><KeyRound size={16} /></button>
                    )}
                    <button onClick={() => setDeleteTarget(user)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500">No users match your search.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Show</span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {[10, 20, 30, 40, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>per page</span>
            <span className="text-slate-400 ml-2">({filtered.length} total)</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e${idx}`} className="px-2 text-slate-400">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                      item === safePage
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteManagedUser(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete User"
        confirmVariant="danger"
      />

      {/* Reset Password Modal */}
      {resetPasswordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-xl">
                <KeyRound size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Reset Password</h3>
                <p className="text-sm text-slate-500">{resetPasswordTarget.name} ({resetPasswordTarget.domainId})</p>
              </div>
            </div>
            <div className="mb-4">
              <Input
                label="New Password"
                type="password"
                value={resetPasswordValue}
                onChange={e => { setResetPasswordValue(e.target.value); setResetPasswordError(''); }}
                placeholder="Minimum 8 characters"
              />
              {resetPasswordError && <p className="text-sm text-red-500 mt-1">{resetPasswordError}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setResetPasswordTarget(null)}>Cancel</Button>
              <Button onClick={handleResetPassword} disabled={resetPasswordLoading || resetPasswordValue.length < 8}>
                {resetPasswordLoading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
