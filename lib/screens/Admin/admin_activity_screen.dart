import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import 'admin_create_timetable_screen.dart';

class AdminActivityScreen extends StatefulWidget {
  final Color institutionColor;

  const AdminActivityScreen({
    super.key,
    required this.institutionColor,
  });

  @override
  State<AdminActivityScreen> createState() => _AdminActivityScreenState();
}

class _AdminActivityScreenState extends State<AdminActivityScreen> {

  List<dynamic> periods = [];
  bool isLoading = true;

  String institutionId = "";

  String selectedClass = "";
  String selectedSection = "";

  List<String> classes = [];
  List<String> sections = [];

  List<Map<String, String>> dateList = [];
  String selectedDate = "";

  bool isTeacherView = false;
  List<Map<String, dynamic>> teachers = [];
  String selectedTeacherId = "";
  String selectedTeacherName = "";

  @override
  void initState() {
    super.initState();
    init();
  }

  Future<void> init() async {
    generateDates();

    final user = FirebaseAuth.instance.currentUser;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user!.uid)
        .get();

    institutionId = userDoc.data()?['institutionId'];

    await fetchTeachers();
    await fetchClasses();
  }

  void generateDates() {
    final now = DateTime.now();

    dateList.clear();

    for (int i = 0; i < 7; i++) {
      final date = now.add(Duration(days: i));

      dateList.add({
        "date": date.day.toString().padLeft(2, '0'),
        "fullDate": DateFormat('yyyy-MM-dd').format(date),
      });
    }

    selectedDate = dateList.first['fullDate']!;
  }

  Future<void> fetchTeachers() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('users')
        .where('institutionId', isEqualTo: institutionId)
        .where('role', isEqualTo: 'teacher')
        .get();

    teachers = snapshot.docs.map((doc) {
      return {
        "id": doc.id,
        "name": doc['name'] ?? "Teacher",
      };
    }).toList();

    if (teachers.isNotEmpty) {
      selectedTeacherId = teachers.first['id'];
      selectedTeacherName = teachers.first['name'];
    }
  }

  Future<void> fetchClasses() async {
    final snapshot = await FirebaseFirestore.instance
        .collection('classes')
        .where('institutionId', isEqualTo: institutionId)
        .get();

    classes = snapshot.docs.map((e) => e['class'].toString()).toList();

    if (classes.isNotEmpty) {
      selectedClass = classes.first;
      await fetchSections();
    }
  }

  Future<void> fetchSections() async {
    final doc = await FirebaseFirestore.instance
        .collection('classes')
        .where('institutionId', isEqualTo: institutionId)
        .where('class', isEqualTo: selectedClass)
        .limit(1)
        .get();

    sections = List<String>.from(doc.docs.first['sections']);

    if (sections.isNotEmpty) {
      selectedSection = sections.first;
      await fetchTimetable();
    }
  }

  Future<void> fetchTimetable() async {
    setState(() => isLoading = true);

    final snapshot = await FirebaseFirestore.instance
        .collection('timetable')
        .where('institutionId', isEqualTo: institutionId)
        .where('date', isEqualTo: selectedDate)
        .get();

    List temp = [];
    bool breakAdded = false;

    for (var doc in snapshot.docs) {
      final data = doc.data();

      for (var p in data['periods']) {
        final isBreak = p['type'] == "break";
        final isMine = p['teacherId'] == selectedTeacherId;

        if (!isTeacherView) {
          if (data['class'] == selectedClass &&
              data['section'] == selectedSection) {
            temp.add(p);
          }
        } else {
          if (isMine) temp.add(p);

          if (isBreak && !breakAdded) {
            temp.add(p);
            breakAdded = true;
          }
        }
      }
    }

    temp.sort((a, b) =>
        (a['startTime'] ?? "").compareTo(b['startTime'] ?? ""));

    periods = temp;

    setState(() => isLoading = false);
  }

  String getDate() {
    final parsed = DateTime.parse(selectedDate);
    return DateFormat("EEEE · d MMM").format(parsed);
  }

  @override
  Widget build(BuildContext context) {
    final primary = widget.institutionColor;

    return Scaffold(
      backgroundColor: primary,

      floatingActionButton: FloatingActionButton(
        backgroundColor: Colors.white,
        child: Icon(Icons.add, color: primary),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AdminCreateTimetableScreen(
                institutionId: institutionId,
                selectedClass: selectedClass,
                selectedSection: selectedSection,
                existingPeriods: periods,
              ),
            ),
          );
        },
      ),

      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, // ⭐ ROOT FIX
          children: [

            /// HEADER (NOW LEFT)
            Container(
              height: 100, // 👈 fixed header height
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              alignment: Alignment.bottomLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  const Text(
                    "Activity",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    getDate(),
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: Column(
                  children: [

                    const SizedBox(height: 16),

                    /// TOGGLE
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _toggle("Class", !isTeacherView, () {
                          setState(() => isTeacherView = false);
                          fetchTimetable();
                        }),
                        const SizedBox(width: 10),
                        _toggle("Teacher", isTeacherView, () {
                          setState(() => isTeacherView = true);
                          fetchTimetable();
                        }),
                      ],
                    ),

                    const SizedBox(height: 12),

                    if (!isTeacherView)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _selectorChip("Class $selectedClass", () {}),
                          const SizedBox(width: 10),
                          _selectorChip("Section $selectedSection", () {}),
                        ],
                      ),

                    if (isTeacherView)
                      _selectorChip(selectedTeacherName, _selectTeacher),

                    const SizedBox(height: 16),

                    /// DATE BAR
                    SizedBox(
                      height: 70,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: dateList.length,
                        itemBuilder: (context, index) {
                          final item = dateList[index];
                          final date = DateTime.parse(item['fullDate']!);
                          final isSelected = item['fullDate'] == selectedDate;
                          final dayName = DateFormat('E').format(date);

                          return GestureDetector(
                            onTap: () {
                              setState(() {
                                selectedDate = item['fullDate']!;
                              });
                              fetchTimetable();
                            },
                            child: Container(
                              width: 60,
                              margin: const EdgeInsets.symmetric(horizontal: 6),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected ? primary : Colors.transparent,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    dayName,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isSelected ? Colors.white : Colors.grey,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    item['date']!,
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: isSelected ? Colors.white : Colors.black,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 10),

                    /// TIMELINE
                    Expanded(
                      child: isLoading
                          ? const Center(child: CircularProgressIndicator())
                          : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: periods.length,
                        itemBuilder: (context, index) {
                          final item = periods[index];
                          return _timelineBlock(item);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _timelineBlock(Map item) {
    final isBreak = item['type'] == "break";

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Text(item['startTime']),
              const SizedBox(height: 4),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: isBreak ? Colors.orange : Colors.grey,
                  shape: BoxShape.circle,
                ),
              ),
              Container(
                width: 2,
                height: 60,
                color: Colors.grey.shade300,
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isBreak
                    ? Colors.orange.withValues(alpha: 0.2)
                    : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['subject']),
                  Text("${item['startTime']} - ${item['endTime']}"),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _toggle(String text, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? widget.institutionColor.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text,
          style: TextStyle(
              color: selected
                  ? widget.institutionColor
                  : Colors.grey),
        ),
      ),
    );
  }

  Widget _selectorChip(String text, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(30),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(text),
            const Icon(Icons.arrow_drop_down),
          ],
        ),
      ),
    );
  }

  void _selectTeacher() {
    showModalBottomSheet(
      context: context,
      builder: (_) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: teachers.map((t) {
            return ListTile(
              title: Text(t['name']),
              onTap: () {
                setState(() {
                  selectedTeacherId = t['id'];
                  selectedTeacherName = t['name'];
                });
                Navigator.pop(context);
                fetchTimetable();
              },
            );
          }).toList(),
        );
      },
    );
  }
}