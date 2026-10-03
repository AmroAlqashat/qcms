import { Injectable } from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';

@Injectable()
export class StaffService {

  inviteStaff(inviteStaffDto: InviteStaffDto) { }

}
