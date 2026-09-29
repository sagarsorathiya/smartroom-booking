import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Company, Department, Designation } from '../../types';
import { Building2, FolderTree, Award, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Card, CardBody, CardHeader } from '../ui/Card';

export const CompanyDeptManagement: React.FC = () => {
  const { companies, departments, designations, addCompany, updateCompany, deleteCompany, addDepartment, updateDepartment, deleteDepartment, addDesignation, updateDesignation, deleteDesignation } = useApp();

  // Tab state
  const [activeTab, setActiveTab] = useState<'companies' | 'departments' | 'designations'>('companies');

  // Company state
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompany, setNewCompany] = useState<{ name: string; code: string; active: boolean }>({ name: '', code: '', active: true });
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);

  // Department state
  const [showAddDept, setShowAddDept] = useState(false);
  const [newDept, setNewDept] = useState<{ name: string; code: string; active: boolean; companyIds: string[] }>({ name: '', code: '', active: true, companyIds: [] });
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);

  // Designation state
  const [showAddDesig, setShowAddDesig] = useState(false);
  const [newDesig, setNewDesig] = useState<{ name: string; code: string; active: boolean; companyIds: string[] }>({ name: '', code: '', active: true, companyIds: [] });
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);
  const [deleteDesigId, setDeleteDesigId] = useState<string | null>(null);

  // Company handlers
  const handleAddCompany = () => {
    if (!newCompany.name || !newCompany.code) return;
    addCompany(newCompany);
    setNewCompany({ name: '', code: '', active: true });
    setShowAddCompany(false);
  };

  const handleSaveCompany = () => {
    if (!editingCompany || !editingCompany.name || !editingCompany.code) return;
    updateCompany(editingCompany);
    setEditingCompany(null);
  };

  const confirmDeleteCompany = () => {
    if (deleteCompanyId) {
      deleteCompany(deleteCompanyId);
      setDeleteCompanyId(null);
    }
  };

  // Department handlers
  const handleAddDept = () => {
    if (!newDept.name || !newDept.code || newDept.companyIds.length === 0) return;
    addDepartment({ name: newDept.name, code: newDept.code, active: newDept.active, companyIds: newDept.companyIds });
    setNewDept({ name: '', code: '', active: true, companyIds: [] });
    setShowAddDept(false);
  };

  const handleSaveDept = () => {
    if (!editingDept || !editingDept.name || !editingDept.code || editingDept.companyIds.length === 0) return;
    updateDepartment(editingDept);
    setEditingDept(null);
  };

  const confirmDeleteDept = () => {
    if (deleteDeptId) { deleteDepartment(deleteDeptId); setDeleteDeptId(null); }
  };

  // Designation handlers
  const handleAddDesig = () => {
    if (!newDesig.name || !newDesig.code || newDesig.companyIds.length === 0) return;
    addDesignation({ name: newDesig.name, code: newDesig.code, active: newDesig.active, companyIds: newDesig.companyIds });
    setNewDesig({ name: '', code: '', active: true, companyIds: [] });
    setShowAddDesig(false);
  };

  const handleSaveDesig = () => {
    if (!editingDesig || !editingDesig.name || !editingDesig.code || editingDesig.companyIds.length === 0) return;
    updateDesignation(editingDesig);
    setEditingDesig(null);
  };

  const confirmDeleteDesig = () => {
    if (deleteDesigId) { deleteDesignation(deleteDesigId); setDeleteDesigId(null); }
  };

  const toggleCompanyForNewDesig = (companyId: string) => {
    setNewDesig(prev => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter(id => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  const toggleCompanyForEditDesig = (companyId: string) => {
    if (!editingDesig) return;
    setEditingDesig({
      ...editingDesig,
      companyIds: editingDesig.companyIds.includes(companyId)
        ? editingDesig.companyIds.filter(id => id !== companyId)
        : [...editingDesig.companyIds, companyId],
    });
  };

  const toggleCompanyForNewDept = (companyId: string) => {
    setNewDept(prev => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter(id => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  const toggleCompanyForEditDept = (companyId: string) => {
    if (!editingDept) return;
    setEditingDept({
      ...editingDept,
      companyIds: editingDept.companyIds.includes(companyId)
        ? editingDept.companyIds.filter(id => id !== companyId)
        : [...editingDept.companyIds, companyId],
    });
  };

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || id;

  const CompanyChips: React.FC<{ companyIds: string[]; onToggle?: (id: string) => void; readonly?: boolean }> = ({ companyIds, onToggle, readonly }) => (
    <div className="flex flex-wrap gap-1.5">
      {readonly ? (
        companyIds.length > 0 ? companyIds.map(id => (
          <span key={id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
            {getCompanyName(id)}
          </span>
        )) : <span className="text-xs text-slate-400 italic">No companies assigned</span>
      ) : (
        companies.filter(c => c.active).map(c => {
          const selected = companyIds.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => onToggle?.(c.id)}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                selected ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50'
              }`}>
              {c.name}
              {selected && <X size={12} className="ml-1" />}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Company, Departments & Designations</h1>
        <p className="text-slate-500">Manage organizational structure</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('companies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'companies' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <Building2 size={16} /> Companies
        </button>
        <button onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'departments' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <FolderTree size={16} /> Departments
        </button>
        <button onClick={() => setActiveTab('designations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'designations' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <Award size={16} /> Designations
        </button>
      </div>

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <Card>
          <CardHeader className="flex items-center justify-between bg-slate-50">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Building2 size={18} className="text-indigo-600" /> Companies</h2>
            <button onClick={() => setShowAddCompany(!showAddCompany)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Add Company"><Plus size={18} /></button>
          </CardHeader>
          <div className="p-5 space-y-4">
            {showAddCompany && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-indigo-900 mb-3">New Company</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="sm:col-span-2"><Input label="Name *" value={newCompany.name} onChange={e => setNewCompany({ ...newCompany, name: e.target.value })} /></div>
                  <div><Input label="Code *" value={newCompany.code} onChange={e => setNewCompany({ ...newCompany, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newCompany.active} onChange={e => setNewCompany({ ...newCompany, active: e.target.checked })} className="rounded text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-800">Active</span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowAddCompany(false)} size="sm">Cancel</Button>
                    <Button onClick={handleAddCompany} disabled={!newCompany.name || !newCompany.code} size="sm">Create</Button>
                  </div>
                </div>
              </div>
            )}

            {companies.length === 0 && !showAddCompany ? (
              <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">No companies yet. Click + to create one.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map(c => (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    {editingCompany?.id === c.id ? (
                      <div className="space-y-3">
                        <Input label="Name *" value={editingCompany.name} onChange={e => setEditingCompany({ ...editingCompany, name: e.target.value })} />
                        <div className="flex gap-3">
                          <div className="flex-1"><Input label="Code *" value={editingCompany.code} onChange={e => setEditingCompany({ ...editingCompany, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={editingCompany.active} onChange={e => setEditingCompany({ ...editingCompany, active: e.target.checked })} className="rounded text-indigo-600" />
                              <span className="text-xs font-semibold text-slate-600">Active</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button onClick={handleSaveCompany} disabled={!editingCompany.name || !editingCompany.code} className="flex-1" size="sm" icon={<Save size={12} />}>Save</Button>
                          <Button variant="secondary" onClick={() => setEditingCompany(null)} className="flex-1" size="sm" icon={<X size={12} />}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-900">{c.name}</h3>
                            <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{c.code}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                            <span className="text-xs text-slate-400">{departments.filter(d => d.companyIds.includes(c.id)).length} depts</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingCompany({ ...c })} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteCompanyId(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <Card>
          <CardHeader className="flex items-center justify-between bg-slate-50">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><FolderTree size={18} className="text-teal-600" /> Departments</h2>
            <button onClick={() => setShowAddDept(!showAddDept)} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Add Department"><Plus size={18} /></button>
          </CardHeader>
          <div className="p-5 space-y-4">
            {showAddDept && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
                <h3 className="font-bold text-teal-900 mb-4 flex items-center gap-2"><FolderTree size={16} /> New Department</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="sm:col-span-2"><Input label="Name *" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} /></div>
                  <div><Input label="Code *" value={newDept.code} onChange={e => setNewDept({ ...newDept, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-teal-800 mb-2">Assign to Companies <span className="text-red-500">*</span></label>
                  <CompanyChips companyIds={newDept.companyIds} onToggle={toggleCompanyForNewDept} />
                  {newDept.companyIds.length === 0 && <p className="text-xs text-amber-600 mt-1">At least one company must be assigned.</p>}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newDept.active} onChange={e => setNewDept({ ...newDept, active: e.target.checked })} className="rounded text-teal-600" />
                    <span className="text-sm font-semibold text-teal-800">Active</span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowAddDept(false)}>Cancel</Button>
                    <Button onClick={handleAddDept} disabled={!newDept.name || !newDept.code || newDept.companyIds.length === 0}>Create</Button>
                  </div>
                </div>
              </div>
            )}

            {departments.length === 0 && !showAddDept ? (
              <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                No departments yet. Click + to create one.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {departments.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    {editingDept?.id === d.id ? (
                      <div className="space-y-3">
                        <Input label="Name *" value={editingDept.name} onChange={e => setEditingDept({ ...editingDept, name: e.target.value })} />
                        <div className="flex gap-3">
                          <div className="flex-1"><Input label="Code *" value={editingDept.code} onChange={e => setEditingDept({ ...editingDept, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={editingDept.active} onChange={e => setEditingDept({ ...editingDept, active: e.target.checked })} className="rounded text-teal-600" />
                              <span className="text-xs font-semibold text-slate-600">Active</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Assign to Companies <span className="text-red-500">*</span></label>
                          <CompanyChips companyIds={editingDept.companyIds} onToggle={toggleCompanyForEditDept} />
                          {editingDept.companyIds.length === 0 && <p className="text-xs text-amber-600 mt-1">At least one company must be assigned.</p>}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button onClick={handleSaveDept} disabled={!editingDept.name || !editingDept.code || editingDept.companyIds.length === 0} className="flex-1" size="sm" icon={<Save size={12} />}>Save</Button>
                          <Button variant="secondary" onClick={() => setEditingDept(null)} className="flex-1" size="sm" icon={<X size={12} />}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-900">{d.name}</h3>
                              <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{d.code}</span>
                            </div>
                            <Badge variant={d.active ? 'success' : 'neutral'}>{d.active ? 'Active' : 'Inactive'}</Badge>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingDept({ ...d })} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteDeptId(d.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500 font-medium mb-1 block">Companies</span>
                          <CompanyChips companyIds={d.companyIds} readonly />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Designations Tab */}
      {activeTab === 'designations' && (
        <Card>
          <CardHeader className="flex items-center justify-between bg-slate-50">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Award size={18} className="text-purple-600" /> Designations</h2>
            <button onClick={() => setShowAddDesig(!showAddDesig)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Add Designation"><Plus size={18} /></button>
          </CardHeader>
          <div className="p-5 space-y-4">
            {showAddDesig && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                <h3 className="font-bold text-purple-900 mb-4 flex items-center gap-2"><Award size={16} /> New Designation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="sm:col-span-2"><Input label="Name *" value={newDesig.name} onChange={e => setNewDesig({ ...newDesig, name: e.target.value })} /></div>
                  <div><Input label="Code *" value={newDesig.code} onChange={e => setNewDesig({ ...newDesig, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-purple-800 mb-2">Assign to Companies <span className="text-red-500">*</span></label>
                  <CompanyChips companyIds={newDesig.companyIds} onToggle={toggleCompanyForNewDesig} />
                  {newDesig.companyIds.length === 0 && <p className="text-xs text-amber-600 mt-1">At least one company must be assigned.</p>}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newDesig.active} onChange={e => setNewDesig({ ...newDesig, active: e.target.checked })} className="rounded text-purple-600" />
                    <span className="text-sm font-semibold text-purple-800">Active</span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowAddDesig(false)}>Cancel</Button>
                    <Button onClick={handleAddDesig} disabled={!newDesig.name || !newDesig.code || newDesig.companyIds.length === 0}>Create</Button>
                  </div>
                </div>
              </div>
            )}

            {designations.length === 0 && !showAddDesig ? (
              <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                No designations yet. Click + to create one.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {designations.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    {editingDesig?.id === d.id ? (
                      <div className="space-y-3">
                        <Input label="Name *" value={editingDesig.name} onChange={e => setEditingDesig({ ...editingDesig, name: e.target.value })} />
                        <div className="flex gap-3">
                          <div className="flex-1"><Input label="Code *" value={editingDesig.code} onChange={e => setEditingDesig({ ...editingDesig, code: e.target.value.toUpperCase() })} maxLength={5} className="font-mono" /></div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={editingDesig.active} onChange={e => setEditingDesig({ ...editingDesig, active: e.target.checked })} className="rounded text-purple-600" />
                              <span className="text-xs font-semibold text-slate-600">Active</span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Assign to Companies <span className="text-red-500">*</span></label>
                          <CompanyChips companyIds={editingDesig.companyIds} onToggle={toggleCompanyForEditDesig} />
                          {editingDesig.companyIds.length === 0 && <p className="text-xs text-amber-600 mt-1">At least one company must be assigned.</p>}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button onClick={handleSaveDesig} disabled={!editingDesig.name || !editingDesig.code || editingDesig.companyIds.length === 0} className="flex-1" size="sm" icon={<Save size={12} />}>Save</Button>
                          <Button variant="secondary" onClick={() => setEditingDesig(null)} className="flex-1" size="sm" icon={<X size={12} />}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-900">{d.name}</h3>
                              <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{d.code}</span>
                            </div>
                            <Badge variant={d.active ? 'success' : 'neutral'}>{d.active ? 'Active' : 'Inactive'}</Badge>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingDesig({ ...d })} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteDesigId(d.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500 font-medium mb-1 block">Companies</span>
                          <CompanyChips companyIds={d.companyIds} readonly />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <ConfirmModal
        isOpen={!!deleteCompanyId}
        onClose={() => setDeleteCompanyId(null)}
        onConfirm={confirmDeleteCompany}
        title="Delete Company"
        message={`Are you sure you want to delete "${companies.find(c => c.id === deleteCompanyId)?.name}"? It will be unlinked from all departments.`}
        confirmLabel="Delete Company"
        confirmVariant="danger"
      />

      <ConfirmModal
        isOpen={!!deleteDeptId}
        onClose={() => setDeleteDeptId(null)}
        onConfirm={confirmDeleteDept}
        title="Delete Department"
        message={`Are you sure you want to delete "${departments.find(d => d.id === deleteDeptId)?.name}"?`}
        confirmLabel="Delete Department"
        confirmVariant="danger"
      />

      <ConfirmModal
        isOpen={!!deleteDesigId}
        onClose={() => setDeleteDesigId(null)}
        onConfirm={confirmDeleteDesig}
        title="Delete Designation"
        message={`Are you sure you want to delete "${designations.find(d => d.id === deleteDesigId)?.name}"?`}
        confirmLabel="Delete Designation"
        confirmVariant="danger"
      />
    </div>
  );
};
