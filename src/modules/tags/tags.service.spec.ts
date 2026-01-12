import { Test, TestingModule } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockTag = {
    id: '1',
    name: 'Urgent',
    color: '#FF0000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new tag', async () => {
      const createDto = {
        name: 'New Tag',
        color: '#00FF00',
      };

      mockPrismaService.tag.findUnique.mockResolvedValue(null);
      mockPrismaService.tag.create.mockResolvedValue({
        ...mockTag,
        ...createDto,
      });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(mockPrismaService.tag.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if name already exists', async () => {
      const createDto = {
        name: 'Existing Tag',
      };

      mockPrismaService.tag.findUnique.mockResolvedValue({
        id: '2',
        name: 'Existing Tag',
      });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return all tags with counts', async () => {
      const tags = [
        {
          ...mockTag,
          _count: { projects: 5, activities: 10 },
        },
      ];
      mockPrismaService.tag.findMany.mockResolvedValue(tags);

      const result = await service.findAll();

      expect(result).toEqual(tags);
      expect(mockPrismaService.tag.findMany).toHaveBeenCalledWith({
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
    });
  });

  describe('findOne', () => {
    it('should return a tag by id', async () => {
      mockPrismaService.tag.findUnique.mockResolvedValue(mockTag);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTag);
    });

    it('should throw NotFoundException if tag not found', async () => {
      mockPrismaService.tag.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update tag data', async () => {
      const updateDto = {
        name: 'Updated Tag',
        color: '#0000FF',
      };

      mockPrismaService.tag.findUnique.mockResolvedValue(mockTag);
      mockPrismaService.tag.update.mockResolvedValue({
        ...mockTag,
        ...updateDto,
      });

      const result = await service.update('1', updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(result.color).toBe(updateDto.color);
    });

    it('should throw ConflictException if name already exists', async () => {
      const updateDto = {
        name: 'Existing Tag',
      };

      mockPrismaService.tag.findUnique
        .mockResolvedValueOnce(mockTag) // Primera llamada en findOne
        .mockResolvedValueOnce({ id: '2', name: 'Existing Tag' }); // Segunda llamada para verificar nombre

      await expect(service.update('1', updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a tag', async () => {
      mockPrismaService.tag.findUnique.mockResolvedValue(mockTag);
      mockPrismaService.tag.delete.mockResolvedValue(mockTag);

      await service.remove('1');

      expect(mockPrismaService.tag.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if tag not found', async () => {
      mockPrismaService.tag.findUnique.mockResolvedValue(null);

      await expect(service.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});
