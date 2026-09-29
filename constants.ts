import { Room, RoomType, User, UserRole, Booking, BookingStatus, BlockedSlot } from './types';
import { addHours } from 'date-fns';

export const FACILITIES = [
  'Projector', 'Whiteboard', 'Video Conf', 'TV Screen', 'Speakerphone', 'HDMI', 'Mic System'
];

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Sarah Jenkins', role: UserRole.EMPLOYEE, email: 'sarah.j@company.com', domainId: 'sarah.jenkins' },
  { id: 'u2', name: 'Reception Desk', role: UserRole.RECEPTION, email: 'reception@company.com', domainId: 'reception' },
  { id: 'u3', name: 'IT Support Team', role: UserRole.IT, email: 'it.support@company.com', domainId: 'it.support' },
  { id: 'u5', name: 'Administration Team', role: UserRole.ADMINISTRATION, email: 'administration@company.com', domainId: 'administration' },
  { id: 'u4', name: 'System Admin', role: UserRole.ADMIN, email: 'admin@company.com', domainId: 'admin' }
];

export const MOCK_ROOMS: Room[] = [
  { 
    id: 'r1', name: 'Summit (A1)', type: RoomType.CONFERENCE, block: 'Block A', capacity: 12, 
    facilities: ['Projector', 'Whiteboard', 'HDMI'],
    imageUrl: 'https://picsum.photos/400/300?random=1'
  },
  { 
    id: 'r2', name: 'Pinnacle (A2)', type: RoomType.BOARD, block: 'Block A', capacity: 20, 
    facilities: ['Video Conf', 'TV Screen', 'Speakerphone', 'Whiteboard'],
    imageUrl: 'https://picsum.photos/400/300?random=2'
  },
  { 
    id: 'r3', name: 'Basecamp (A3)', type: RoomType.CONFERENCE, block: 'Block A', capacity: 8, 
    facilities: ['TV Screen', 'HDMI'],
    imageUrl: 'https://picsum.photos/400/300?random=3'
  },
  { 
    id: 'r4', name: 'Horizon (B1)', type: RoomType.BOARD, block: 'Block B', capacity: 25, 
    facilities: ['Video Conf', 'Projector', 'Mic System', 'Speakerphone'],
    imageUrl: 'https://picsum.photos/400/300?random=4'
  },
  { 
    id: 'r5', name: 'Vista (B2)', type: RoomType.CONFERENCE, block: 'Block B', capacity: 10, 
    facilities: ['TV Screen', 'Whiteboard'],
    imageUrl: 'https://picsum.photos/400/300?random=5'
  },
  { 
    id: 'r6', name: 'Outlook (B3)', type: RoomType.CONFERENCE, block: 'Block B', capacity: 6, 
    facilities: ['Whiteboard'],
    imageUrl: 'https://picsum.photos/400/300?random=6'
  },
];

const today = new Date();
today.setHours(0, 0, 0, 0);

export const INITIAL_BOOKINGS: Booking[] = [
  {
    id: 'b1',
    roomId: 'r2',
    userId: 'u1',
    userName: 'Sarah Jenkins',
    title: 'Q3 Strategy Review',
    startTime: addHours(today, 10),
    endTime: addHours(today, 12),
    status: BookingStatus.CONFIRMED,
    participants: 12,
    company: 'TechCorp',
    department: 'Strategy',
    chairPerson: 'Sarah Jenkins',
    notifyEmails: [],
    serviceRequests: [],
    itRequirements: {
      vcRequired: true,
      createMeetingLink: true,
      platform: 'Teams',
      avSetup: true,
      supportStandby: false,
      status: 'PENDING'
    }
  },
  {
    id: 'b2',
    roomId: 'r4',
    userId: 'u1',
    userName: 'Sarah Jenkins',
    title: 'Client Pitch',
    startTime: addHours(today, 14),
    endTime: addHours(today, 15),
    status: BookingStatus.CONFIRMED,
    participants: 5,
    company: 'TechCorp',
    department: 'Sales',
    chairPerson: 'Mike Ross',
    notifyEmails: [],
    serviceRequests: [],
    itRequirements: {
      vcRequired: true,
      createMeetingLink: true,
      platform: 'Zoom',
      avSetup: false,
      supportStandby: true,
      status: 'PENDING'
    }
  },
  {
    id: 'b3',
    roomId: 'r1',
    userId: 'u4',
    userName: 'System Admin',
    title: 'Internal Audit',
    startTime: addHours(today, 9),
    endTime: addHours(today, 10),
    status: BookingStatus.CONFIRMED,
    participants: 3,
    company: 'TechCorp',
    department: 'Internal Audit',
    chairPerson: 'Admin',
    notifyEmails: [],
    serviceRequests: [],
    itRequirements: {
      vcRequired: false,
      createMeetingLink: false,
      avSetup: false,
      supportStandby: false,
      status: 'COMPLETED'
    }
  }
];