import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';

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
    return this.projectsService.getOwned(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    await this.projectsService.deleteOwned(id, user.sub);
  }
}
