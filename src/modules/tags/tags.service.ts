import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTagDto) {
    const existing = await this.prisma.tag.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Ya existe un tag con ese nombre');
    }

    const tag = await this.prisma.tag.create({
      data: dto,
      include: {
        _count: {
          select: {
            projects: true,
            activities: true,
          },
        },
      },
    });

    return tag;
  }

  async findAll() {
    return this.prisma.tag.findMany({
      include: {
        _count: {
          select: {
            projects: true,
            activities: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            projects: true,
            activities: true,
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException('Tag no encontrado');
    }

    return tag;
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.findOne(id);

    if (dto.name) {
      const existing = await this.prisma.tag.findUnique({
        where: { name: dto.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe un tag con ese nombre');
      }
    }

    const tag = await this.prisma.tag.update({
      where: { id },
      data: dto,
      include: {
        _count: {
          select: {
            projects: true,
            activities: true,
          },
        },
      },
    });

    return tag;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.tag.delete({
      where: { id },
    });

    return { message: 'Tag eliminado exitosamente' };
  }
}
