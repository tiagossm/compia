import React, { createContext, useContext, useState, useEffect } from 'react'

interface Inspection {
  id: string
  title: string
  location: string
  date: string
  status: 'pending' | 'in_progress' | 'completed' | 'requires_action'
  inspector: string
  score: number
  organizationId: string
}

interface Organization {
  id: string
  name: string
  cnpj: string
  address: string
  parentId?: string
}

interface DataContextType {
  inspections: Inspection[]
  organizations: Organization[]
  addInspection: (inspection: Omit<Inspection, 'id'>) => void
  updateInspection: (id: string, inspection: Partial<Inspection>) => void
  deleteInspection: (id: string) => void
  addOrganization: (organization: Omit<Organization, 'id'>) => void
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])

  useEffect(() => {
    // Dados mock iniciais
    const mockInspections: Inspection[] = [
      {
        id: '1',
        title: 'Inspeção de Segurança - Fábrica Principal',
        location: 'São Paulo, SP',
        date: '2024-01-15',
        status: 'completed',
        inspector: 'João Silva',
        score: 85,
        organizationId: '1'
      },
      {
        id: '2',
        title: 'Auditoria EPI - Setor Produção',
        location: 'Rio de Janeiro, RJ',
        date: '2024-01-14',
        status: 'requires_action',
        inspector: 'Maria Santos',
        score: 72,
        organizationId: '1'
      },
      {
        id: '3',
        title: 'Verificação CIPA - Escritório',
        location: 'Belo Horizonte, MG',
        date: '2024-01-13',
        status: 'in_progress',
        inspector: 'Carlos Oliveira',
        score: 90,
        organizationId: '2'
      }
    ]

    const mockOrganizations: Organization[] = [
      {
        id: '1',
        name: 'Empresa Principal LTDA',
        cnpj: '12.345.678/0001-90',
        address: 'Av. Paulista, 1000 - São Paulo, SP'
      },
      {
        id: '2',
        name: 'Filial Rio de Janeiro',
        cnpj: '12.345.678/0002-71',
        address: 'Rua Copacabana, 500 - Rio de Janeiro, RJ',
        parentId: '1'
      }
    ]

    setInspections(mockInspections)
    setOrganizations(mockOrganizations)
  }, [])

  const addInspection = (inspection: Omit<Inspection, 'id'>) => {
    const newInspection = {
      ...inspection,
      id: Date.now().toString()
    }
    setInspections(prev => [...prev, newInspection])
  }

  const updateInspection = (id: string, updates: Partial<Inspection>) => {
    setInspections(prev => 
      prev.map(inspection => 
        inspection.id === id ? { ...inspection, ...updates } : inspection
      )
    )
  }

  const deleteInspection = (id: string) => {
    setInspections(prev => prev.filter(inspection => inspection.id !== id))
  }

  const addOrganization = (organization: Omit<Organization, 'id'>) => {
    const newOrganization = {
      ...organization,
      id: Date.now().toString()
    }
    setOrganizations(prev => [...prev, newOrganization])
  }

  return (
    <DataContext.Provider value={{
      inspections,
      organizations,
      addInspection,
      updateInspection,
      deleteInspection,
      addOrganization
    }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}