import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.create(user.sub, dto.name);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.projectsService.listForUser(user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.getAccessible(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.projectsService.deleteOwned(id, user.sub);
  }

  @Post(':id/members')
  inviteMember(@Param('id') id: string, @Body() dto: InviteMemberDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.inviteMember(id, user.sub, dto.email, dto.role);
  }

  @Get(':id/members')
  listMembers(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.projectsService.listMembers(id, user.sub);
  }

  @Patch(':id/members/:memberUserId')
  updateMemberRole(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.updateMemberRole(id, user.sub, memberUserId, dto.role);
  }

  @Delete(':id/members/:memberUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') id: string,
    @Param('memberUserId') memberUserId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.projectsService.removeMember(id, user.sub, memberUserId);
  }
}
